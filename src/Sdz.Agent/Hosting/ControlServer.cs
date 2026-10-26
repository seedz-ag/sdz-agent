using System.IO.Pipes;
using System.Net.Sockets;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Sdz.Agent.Commands;
using Sdz.Agent.Control;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Hosting;

/// <summary>
/// Local control channel used by the tray app and `sdz-agent status`:
/// a named pipe on Windows (Authenticated Users) or a unix socket on Linux/macOS
/// (0660, group sdz-agent when it exists). One JSON request line → one JSON response line.
/// </summary>
public sealed class ControlServer : BackgroundService
{
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly AgentState _state;
    private readonly ConfigureCommand _configure;
    private readonly ExecuteCommand _execute;
    private readonly SchedulerCommand _scheduler;
    private readonly CheckCommand _check;
    private readonly ListenCommand _listen;
    private readonly Logger _logger;

    public ControlServer(AgentEnvironment env, AgentPaths paths, AgentState state, ConfigureCommand configure,
        ExecuteCommand execute, SchedulerCommand scheduler, CheckCommand check, Logger logger, ListenCommand listen)
    {
        _listen = listen;
        _env = env;
        _paths = paths;
        _state = state;
        _configure = configure;
        _execute = execute;
        _scheduler = scheduler;
        _check = check;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            if (OperatingSystem.IsWindows()) await ServePipeAsync(stoppingToken).ConfigureAwait(false);
            else await ServeSocketAsync(stoppingToken).ConfigureAwait(false);
        }
        catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { }
        catch (Exception e)
        {
            _logger.Error("CONTROL CHANNEL STOPPED", e.Message);
        }
    }

    // ---------------------------------------------------------------- transports

    private async Task ServePipeAsync(CancellationToken ct)
    {
        _logger.Info($"CONTROL CHANNEL LISTENING ON \\\\.\\pipe\\{ControlEndpoint.PipeName}");
        while (!ct.IsCancellationRequested)
        {
            var pipe = CreatePipe();
            try
            {
                await pipe.WaitForConnectionAsync(ct).ConfigureAwait(false);
            }
            catch
            {
                pipe.Dispose();
                if (ct.IsCancellationRequested) return;
                await Task.Delay(500, ct).ConfigureAwait(false);
                continue;
            }
            _ = HandleAsync(pipe, ct);
        }
    }

    private static NamedPipeServerStream CreatePipe()
    {
        if (OperatingSystem.IsWindows())
        {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null),
                PipeAccessRights.ReadWrite, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                PipeAccessRights.FullControl, AccessControlType.Allow));
            return NamedPipeServerStreamAcl.Create(ControlEndpoint.PipeName, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances,
                PipeTransmissionMode.Byte, PipeOptions.Asynchronous, 0, 0, security);
        }
        return new NamedPipeServerStream(ControlEndpoint.PipeName, PipeDirection.InOut, NamedPipeServerStream.MaxAllowedServerInstances,
            PipeTransmissionMode.Byte, PipeOptions.Asynchronous);
    }

    private async Task ServeSocketAsync(CancellationToken ct)
    {
        var path = ControlEndpoint.ServerSocketPath(_paths.DataDir);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        if (File.Exists(path)) File.Delete(path);

        using var listener = new Socket(AddressFamily.Unix, SocketType.Stream, ProtocolType.Unspecified);
        listener.Bind(new UnixDomainSocketEndPoint(path));
        listener.Listen(16);
        ApplySocketPermissions(path);
        _logger.Info($"CONTROL CHANNEL LISTENING ON {path}");

        try
        {
            while (!ct.IsCancellationRequested)
            {
                var client = await listener.AcceptAsync(ct).ConfigureAwait(false);
                _ = HandleAsync(new NetworkStream(client, ownsSocket: true), ct);
            }
        }
        finally
        {
            try { File.Delete(path); } catch { }
        }
    }

    private void ApplySocketPermissions(string path)
    {
        try
        {
            var mode = _env.GetOrNull("SDZ_AGENT_CONTROL_MODE");
            var group = _env.GetOrNull("SDZ_AGENT_CONTROL_GROUP") ?? "sdz-agent";
            var chown = Environment.UserName == "root" && RunQuiet("chgrp", $"{group} {path}");
            var unix = mode switch
            {
                "0666" or "666" => UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.OtherRead | UnixFileMode.OtherWrite,
                "0600" or "600" => UnixFileMode.UserRead | UnixFileMode.UserWrite,
                _ => chown
                    ? UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.GroupWrite
                    : UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead | UnixFileMode.GroupWrite | UnixFileMode.OtherRead | UnixFileMode.OtherWrite,
            };
            File.SetUnixFileMode(path, unix);
            if (!chown && mode is null && Environment.UserName == "root")
                _logger.Warn($"GROUP {group} NOT FOUND, CONTROL SOCKET IS WORLD-WRITABLE (set SDZ_AGENT_CONTROL_MODE=0600 to restrict)");
        }
        catch (Exception e)
        {
            _logger.Warn("COULD NOT SET CONTROL SOCKET PERMISSIONS", e.Message);
        }
    }

    private static bool RunQuiet(string file, string args)
    {
        try
        {
            using var p = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(file, args) { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true });
            p!.WaitForExit(5000);
            return p.ExitCode == 0;
        }
        catch { return false; }
    }

    // ---------------------------------------------------------------- protocol

    private async Task HandleAsync(Stream stream, CancellationToken ct)
    {
        await using (stream)
        {
            try
            {
                using var reader = new StreamReader(stream, Encoding.UTF8, leaveOpen: true);
                var line = await reader.ReadLineAsync(ct).ConfigureAwait(false);
                if (string.IsNullOrWhiteSpace(line)) return;

                ControlResponse response;
                try
                {
                    var request = JsonSerializer.Deserialize(line, ControlJsonContext.Default.ControlRequest) ?? new ControlRequest();
                    response = await DispatchAsync(request, ct).ConfigureAwait(false);
                }
                catch (Exception e)
                {
                    response = ControlResponse.Failure(e.Message);
                }

                var json = JsonSerializer.Serialize(response, ControlJsonContext.Default.ControlResponse) + "\n";
                await stream.WriteAsync(Encoding.UTF8.GetBytes(json), ct).ConfigureAwait(false);
                await stream.FlushAsync(ct).ConfigureAwait(false);
            }
            catch (Exception e) when (!ct.IsCancellationRequested)
            {
                _logger.Warn("CONTROL REQUEST FAILED", e.Message);
            }
        }
    }

    private async Task<ControlResponse> DispatchAsync(ControlRequest request, CancellationToken ct)
    {
        switch (request.Op.ToLowerInvariant())
        {
            case "ping":
                return ControlResponse.Success("pong");

            case "status":
                _state.Running = _execute.IsRunning;
                _state.Listening = _listen.Connected;
                return new ControlResponse { Ok = true, Status = _state.Snapshot() };

            case "logs":
                return new ControlResponse { Ok = true, Logs = TailLogs(Math.Clamp(request.Lines, 1, 2000)) };

            case "exportlogs":
                return new ControlResponse { Ok = true, Logs = Services.LogExport.ReadAll(_paths) };

            case "clearlogs":
            {
                // local log files only; output/*.log holds entries still waiting to be shipped to the API and is kept
                var removed = 0;
                if (Directory.Exists(_paths.LogsDir))
                {
                    foreach (var file in Directory.EnumerateFiles(_paths.LogsDir, "*.log").ToList())
                    {
                        try { File.Delete(file); removed++; } catch { }
                    }
                }
                _logger.Info($"LOGS CLEARED ({removed} FILES)");
                return ControlResponse.Success($"{removed} ARQUIVO(S) DE LOG REMOVIDO(S)");
            }

            case "run":
                if (_execute.IsRunning) return ControlResponse.Failure("EXTRACTION ALREADY RUNNING");
                if (!_state.Snapshot().Configured) return ControlResponse.Failure("AGENT NOT CONFIGURED");
                _ = Task.Run(async () =>
                {
                    try { await _execute.ExecuteAsync(ct).ConfigureAwait(false); _state.ExecutionFinished(true); }
                    catch (Exception e) { _state.ExecutionFinished(false, e.Message); }
                }, ct);
                return ControlResponse.Success("EXTRACTION STARTED");

            case "configure":
            {
                if (string.IsNullOrWhiteSpace(request.ClientId) || string.IsNullOrWhiteSpace(request.ClientSecret))
                    return ControlResponse.Failure("CLIENT ID AND CLIENT SECRET ARE REQUIRED");
                var apiUrl = string.IsNullOrWhiteSpace(request.ApiUrl) ? ConfigureCommand.DefaultApiUrl : request.ApiUrl.Trim();
                if (!apiUrl.EndsWith('/')) apiUrl += "/";
                if (!Uri.TryCreate(apiUrl, UriKind.Absolute, out _)) return ControlResponse.Failure("INVALID API URL");

                if (!await _configure.ValidateAsync(apiUrl, request.ClientId.Trim(), request.ClientSecret.Trim(), ct).ConfigureAwait(false))
                    return ControlResponse.Failure("INVALID CREDENTIALS");

                _paths.EnsureDirectories();
                DotEnv.Write(_paths.EnvFile, new Dictionary<string, string>
                {
                    ["API_URL"] = apiUrl,
                    ["CLIENT_ID"] = request.ClientId.Trim(),
                    ["CLIENT_SECRET"] = request.ClientSecret.Trim(),
                });
                _env.SkipCredentialValidation = false;
                _env.Parse();
                _state.AuthOk = true;
                _state.SetError(null);
                _logger.Info("CREDENTIALS UPDATED THROUGH THE CONTROL CHANNEL, RESTARTING SCHEDULER");
                _scheduler.RequestRestart();
                _listen.Reconnect();
                return ControlResponse.Success("CONFIGURATION SAVED");
            }

            case "clear":
            {
                if (_execute.IsRunning) return ControlResponse.Failure("EXTRACTION RUNNING, TRY AGAIN LATER");
                try { if (File.Exists(_paths.EnvFile)) File.Delete(_paths.EnvFile); }
                catch (Exception e) { return ControlResponse.Failure($"COULD NOT REMOVE {_paths.EnvFile}: {e.Message}"); }
                _env.SkipCredentialValidation = true;
                _env.Parse();
                _state.AuthOk = false;
                _state.SetSchedules(Array.Empty<string>());
                _state.SetNextRun(null);
                _state.SetError("AGENT NOT CONFIGURED");
                _logger.Warn("CREDENTIALS REMOVED THROUGH THE CONTROL CHANNEL, SCHEDULER IDLE UNTIL CONFIGURED");
                _scheduler.RequestRestart();
                _listen.Reconnect();
                return ControlResponse.Success("CREDENTIALS REMOVED");
            }

            default:
                return ControlResponse.Failure($"UNKNOWN OPERATION '{request.Op}'");
        }
    }

    private List<string> TailLogs(int lines)
    {
        try
        {
            var file = Directory.Exists(_paths.LogsDir)
                ? Directory.EnumerateFiles(_paths.LogsDir, "agent-*.log").OrderByDescending(f => f).FirstOrDefault()
                : null;
            if (file is null) return new List<string>();
            var all = File.ReadAllLines(file);
            return all.Skip(Math.Max(0, all.Length - lines)).Select(l =>
            {
                try
                {
                    var arr = Json.Deserialize<string[]>(l);
                    return arr is { Length: >= 3 } ? $"{arr[1]} {arr[0],5} {string.Join(" ", arr.Skip(2))}" : l;
                }
                catch { return l; }
            }).ToList();
        }
        catch
        {
            return new List<string>();
        }
    }
}
