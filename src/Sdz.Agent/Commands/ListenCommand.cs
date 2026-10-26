using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Data;
using Sdz.Agent.Telemetry;

namespace Sdz.Agent.Commands;

/// <summary>
/// Port of ListenCommand + ListenExecute/Query/Shell/Response: keeps a long-lived
/// GET /commands stream open and dispatches each newline-delimited JSON message.
/// </summary>
public sealed class ListenCommand
{
    private readonly ApiService _api;
    private readonly DatabaseAdapter _database;
    private readonly AgentEnvironment _env;
    private readonly ExecuteCommand _execute;
    private readonly HttpClientAdapter _http;
    private readonly Logger _logger;
    private readonly TelemetryService _telemetry;
    private readonly Update.UpdateService _updates;

    public ListenCommand(ApiService api, DatabaseAdapter database, AgentEnvironment env, ExecuteCommand execute,
        HttpClientAdapter http, Logger logger, TelemetryService telemetry, Update.UpdateService updates)
    {
        _updates = updates;
        _api = api;
        _database = database;
        _env = env;
        _execute = execute;
        _http = http;
        _logger = logger;
        _telemetry = telemetry;
    }

    /// <summary>The API sends a Ping every 30 s; this long without any byte means the connection is dead.</summary>
    public static readonly TimeSpan IdleTimeout = TimeSpan.FromSeconds(90);

    private CancellationTokenSource? _connection;
    private volatile CancellationTokenSource? _wait;

    /// <summary>True while a /commands stream is open.</summary>
    public bool Connected { get; private set; }

    /// <summary>Drops the current connection so the loop reconnects (e.g. with new credentials).</summary>
    public void Reconnect()
    {
        try { _connection?.Cancel(); } catch (ObjectDisposedException) { }
        try { _wait?.Cancel(); } catch (ObjectDisposedException) { } // also cut a backoff wait short
    }

    /// <summary>
    /// Keeps the command channel open for the whole life of the process: reconnects after any close,
    /// error, idle timeout or <see cref="Reconnect"/>, with a short backoff (2 s → 60 s, reset after a
    /// connection that lasted more than a minute). Skips while the agent has no credentials.
    /// </summary>
    public async Task RunForeverAsync(CancellationToken ct)
    {
        var delays = new[] { 2, 5, 10, 30, 60 };
        var attempt = 0;
        while (!ct.IsCancellationRequested)
        {
            if (string.IsNullOrEmpty(_env.GetOrNull("CLIENT_ID")) || string.IsNullOrEmpty(_env.GetOrNull("CLIENT_SECRET")))
            {
                try { await Task.Delay(TimeSpan.FromSeconds(2), ct).ConfigureAwait(false); } catch { return; }
                continue;
            }

            using var connection = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _connection = connection;
            var started = DateTimeOffset.UtcNow;
            try
            {
                await ExecuteAsync(connection.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested)
            {
                return;
            }
            catch (OperationCanceledException)
            {
                // Reconnect() or idle watchdog: reconnect right away
                attempt = 0;
                _connection = null;
                continue;
            }
            catch (Exception error)
            {
                _logger.Error("LISTEN ERROR", error.Message);
            }
            finally
            {
                Connected = false;
                _connection = null;
            }

            if (DateTimeOffset.UtcNow - started > TimeSpan.FromMinutes(1)) attempt = 0;
            var delay = delays[Math.Min(attempt++, delays.Length - 1)];
            _logger.Warn($"COMMANDS STREAM DOWN, RECONNECTING IN {delay}S");
            using var wait = CancellationTokenSource.CreateLinkedTokenSource(ct);
            _wait = wait;
            try { await Task.Delay(TimeSpan.FromSeconds(delay), wait.Token).ConfigureAwait(false); }
            catch (OperationCanceledException) when (!ct.IsCancellationRequested) { attempt = 0; }
            catch { return; }
            finally { _wait = null; }
        }
    }

    /// <summary>Runs until the stream closes (returns) or fails (throws).</summary>
    public async Task ExecuteAsync(CancellationToken ct = default)
    {
        _telemetry.Start(TelemetryMode.Listen);
        _logger.Info("START LISTENING COMMANDS");

        var headers = new Dictionary<string, string>
        {
            ["Authorization"] = ApiService.BasicAuth(_env.ClientId, _env.ClientSecret),
        };

        Stream stream;
        HttpResponseMessage response;
        try
        {
            _logger.Info("STREAM OPEN");
            (stream, response) = await _http.RequestStreamAsync(new HttpRequestSpec
            {
                Url = $"{_env.ApiUrl}commands",
                Method = "GET",
                Headers = headers,
                Timeout = int.MaxValue,
            }, ct).ConfigureAwait(false);
        }
        catch (HttpRequestFailedException e)
        {
            _logger.Info($"STREAM CLOSED {e.StatusCode} - {e.StatusText}");
            throw;
        }

        using (response)
        await using (stream)
        using (var reader = new StreamReader(stream, Encoding.UTF8))
        using (var idle = CancellationTokenSource.CreateLinkedTokenSource(ct))
        {
            Connected = true;
            var buffer = new StringBuilder();
            while (!ct.IsCancellationRequested)
            {
                // watchdog: any byte (the 30 s Ping included) re-arms it; silence means a dead connection
                idle.CancelAfter(IdleTimeout);
                string? line;
                try
                {
                    line = await reader.ReadLineAsync(idle.Token).ConfigureAwait(false);
                }
                catch (OperationCanceledException) when (!ct.IsCancellationRequested)
                {
                    _logger.Warn($"NO DATA FROM THE COMMANDS STREAM IN {IdleTimeout.TotalSeconds:0}S, RECONNECTING");
                    break;
                }
                if (line is null) break;
                if (line.Trim().Length == 0) continue;

                buffer.Append(line);
                JsonObject? message;
                try
                {
                    message = Json.Parse(buffer.ToString()) as JsonObject;
                    buffer.Clear();
                }
                catch
                {
                    // partial frame, keep accumulating until it parses
                    if (buffer.Length > 1_000_000) buffer.Clear();
                    continue;
                }
                if (message is null) continue;

                _ = HandleAsync(message, ct);
            }
            _logger.Info("STREAM CLOSED");
        }
    }

    private async Task HandleAsync(JsonObject message, CancellationToken ct)
    {
        var command = message["command"]?.ToString() ?? "";
        var sender = message["sender"]?.ToString();
        var arguments = message["arguments"] as JsonArray ?? new JsonArray();

        try
        {
            object? result;
            switch (command)
            {
                case "Ping":
                    return;
                case "Response":
                    _logger.Info(arguments.ToJsonString());
                    return;
                case "Execute":
                    _env.Parse();
                    result = await ListenExecuteAsync(arguments, ct).ConfigureAwait(false);
                    break;
                case "Query":
                    _env.Parse();
                    result = await ListenQueryAsync(arguments, ct).ConfigureAwait(false);
                    break;
                case "Shell":
                    result = await ListenShellAsync(arguments, ct).ConfigureAwait(false);
                    break;
                case "Update":
                    await ListenUpdateAsync(sender, arguments, ct).ConfigureAwait(false);
                    return;
                default:
                    _logger.Warn($"UNKNOWN COMMAND {command}");
                    return;
            }

            if (sender is not null) await RespondAsync(sender, result, ct).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            _logger.Error(error.Message);
        }
    }

    // ---------------------------------------------------------------- Update

    /// <summary>Answers the sender first, then launches the installer (which stops and restarts this service).</summary>
    private async Task ListenUpdateAsync(string? sender, JsonArray args, CancellationToken ct)
    {
        var options = Update.UpdateOptions.Parse(args);
        _logger.Info($"REMOTE UPDATE REQUESTED {Json.Serialize(options)}");
        Update.UpdateResult result;
        Action? launch = null;
        if (_execute.IsRunning && !options.Force && !options.CheckOnly)
            result = new Update.UpdateResult { Status = "rejected", Current = Utils.Version, Message = "extraction in progress; retry later or send force" };
        else
            (result, launch) = await _updates.PrepareAsync(options, ct).ConfigureAwait(false);

        _logger.Info($"REMOTE UPDATE {result.Status.ToUpperInvariant()} {result.Current} -> {result.Target} {result.Message}");
        if (sender is not null) await RespondAsync(sender, result, ct).ConfigureAwait(false);
        if (launch is not null)
        {
            await Task.Delay(TimeSpan.FromSeconds(2), CancellationToken.None).ConfigureAwait(false); // let the answer and the log page reach the API
            try { launch(); }
            catch (Exception e) { _logger.Error("REMOTE UPDATE LAUNCH FAILED", e.Message); }
        }
    }

    // ---------------------------------------------------------------- Execute

    private async Task<bool> ListenExecuteAsync(JsonArray args, CancellationToken ct)
    {
        _logger.Info($"COMMAND {args.ToJsonString()}");
        MergeArgs(args);
        try
        {
            await _execute.ExecuteAsync(ct).ConfigureAwait(false);
            return true;
        }
        catch (Exception e)
        {
            _logger.Error("LISTEN EXECUTE ERROR", e.Message);
            throw;
        }
    }

    /// <summary>arguments is an array of arrays of {arg, value}; each pair becomes an env override.</summary>
    private void MergeArgs(JsonArray args)
    {
        var merged = new Dictionary<string, string?>();
        foreach (var group in args.OfType<JsonArray>())
        {
            foreach (var item in group.OfType<JsonObject>())
            {
                var arg = item["arg"]?.ToString();
                if (string.IsNullOrEmpty(arg)) continue;
                var key = arg.Replace("--", "").Replace("=", "");
                merged[key] = item["value"]?.ToString()?.Trim();
            }
        }
        if (merged.Count > 0) _env.Merge(merged);
    }

    // ---------------------------------------------------------------- Query

    private async Task<object?> ListenQueryAsync(JsonArray args, CancellationToken ct)
    {
        _logger.Info("command", args.ToJsonString());
        MergeArgs(args);

        var env = _env.Env ?? "DEV";
        if (env != "DEV")
        {
            _env.SetDiscovery(await _api.DiscoveryAsync(ct).ConfigureAwait(false));
        }

        var command = args.Count > 0 ? args[^1] as JsonArray : null;
        var query = command?.OfType<JsonObject>().FirstOrDefault(q => q["label"]?.ToString() == "query")?["value"]?.ToString();
        if (string.IsNullOrWhiteSpace(query))
        {
            _logger.Info("Query is Required");
            return "Query is Required.";
        }

        var forbidden = new[] { "UPDATE", "INSERT", "DELETE", "DROP", "TRUNCATE", "ALTER" };
        if (query.ToUpperInvariant().Split(new[] { ' ', '\n', '\r', '\t', '(', ';' }, StringSplitOptions.RemoveEmptyEntries).Any(forbidden.Contains))
        {
            return "ERROR";
        }

        Setting setting;
        try
        {
            setting = await _api.GetSettingAsync(ct).ConfigureAwait(false);
        }
        catch (Exception e)
        {
            _logger.Error("LISTEN QUERY ERROR", e.Message);
            return e.Message;
        }

        var driver = setting.Parameter("DATABASE_DRIVER")?.ToUpperInvariant();
        if (string.IsNullOrEmpty(driver))
        {
            _logger.Error("DATABASE DRIVER NOT FOUND");
            return null;
        }

        await _database.InitializeAsync(driver, Utils.ExtractDatabaseConfig(setting.Parameters), setting.Parameters, ct).ConfigureAwait(false);
        var result = await _database.ExecuteQueryRemoteAsync(query, ct).ConfigureAwait(false);
        _logger.Info(result);
        return result;
    }

    // ---------------------------------------------------------------- Shell

    private static async Task<string> ListenShellAsync(JsonArray args, CancellationToken ct)
    {
        var command = args.Count > 0 ? args[^1]?.ToString() : null;
        if (string.IsNullOrWhiteSpace(command)) throw new InvalidOperationException("Command is Required.");

        var psi = OperatingSystem.IsWindows()
            ? new ProcessStartInfo("cmd.exe", $"/d /s /c \"{command}\"")
            : new ProcessStartInfo("/bin/sh", $"-c \"{command.Replace("\"", "\\\"")}\"");
        psi.RedirectStandardOutput = true;
        psi.RedirectStandardError = true;
        psi.UseShellExecute = false;
        psi.CreateNoWindow = true;

        using var process = Process.Start(psi)!;
        var stdout = process.StandardOutput.ReadToEndAsync(ct);
        var stderr = process.StandardError.ReadToEndAsync(ct);
        await process.WaitForExitAsync(ct).ConfigureAwait(false);
        var output = await stdout.ConfigureAwait(false);
        var error = await stderr.ConfigureAwait(false);
        return process.ExitCode != 0 && error.Length > 0 ? error : output;
    }

    // ---------------------------------------------------------------- Response

    private async Task RespondAsync(string channel, object? result, CancellationToken ct)
    {
        try
        {
            await _http.PostAsync<string>($"{_env.ApiUrl}commands",
                new { arguments = new[] { result }, channel, command = "Response" },
                new RequestOptions
                {
                    Headers = new Dictionary<string, string>
                    {
                        ["Authorization"] = ApiService.BasicAuth(_env.ClientId, _env.ClientSecret),
                        ["Content-Type"] = "application/json",
                    },
                }, ct).ConfigureAwait(false);
        }
        catch (Exception error)
        {
            _logger.Error(error.Message);
        }
    }
}
