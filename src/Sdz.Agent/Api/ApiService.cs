using System.Text;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Telemetry;

namespace Sdz.Agent.Api;

/// <summary>Port of APIService: the integration API client used by every command.</summary>
public sealed class ApiService
{
    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly HttpClientAdapter _http;
    private readonly Logger _logger;
    private readonly NetworkTelemetryRecorder _recorder;
    private readonly Utils _utils;
    private bool _fileLoggingEnabled;

    public ApiService(AgentEnvironment env, AgentPaths paths, HttpClientAdapter http, Logger logger, NetworkTelemetryRecorder recorder, Utils utils)
    {
        _env = env;
        _paths = paths;
        _http = http;
        _logger = logger;
        _recorder = recorder;
        _utils = utils;
    }

    public static string BasicAuth(string clientId, string clientSecret) =>
        "Basic " + Convert.ToBase64String(Encoding.UTF8.GetBytes($"{clientId}:{clientSecret}"));

    public Dictionary<string, string> Headers() => new()
    {
        ["Authorization"] = BasicAuth(_env.ClientId, _env.ClientSecret),
        ["sdz-request-id"] = Guid.NewGuid().ToString(),
    };

    private Dictionary<string, string> LogHeaders() => new()
    {
        ["Authorization"] = BasicAuth(_env.BaseClientId, _env.BaseClientSecret),
        ["sdz-request-id"] = Guid.NewGuid().ToString(),
    };

    public async Task<Discovery> DiscoveryAsync(CancellationToken ct = default)
    {
        _logger.Info("DISCOVERING");
        var discovery = await _http.GetAsync<Discovery>($"{_env.ApiUrl}discovery",
            new RequestOptions { Headers = Headers(), Timeout = _env.ApiRequestTimeout }, ct).ConfigureAwait(false);
        return discovery ?? new Discovery();
    }

    public async Task<Setting> GetSettingAsync(CancellationToken ct = default)
    {
        _logger.Info($"ENVIRONMENT {_env.ApiUrl}");
        _logger.Info("GETTING SETTING");
        var setting = await _http.GetAsync<Setting>($"{_env.ApiUrl}settings",
            new RequestOptions { Headers = Headers(), Timeout = _env.ApiRequestTimeout }, ct).ConfigureAwait(false);
        if (setting is null)
        {
            _logger.Error("SETTING NOT FOUND");
            throw new InvalidOperationException("SETTING NOT FOUND");
        }
        _logger.Info("SETTING ACQUIRED");
        return ApplyOverride(setting);
    }

    /// <summary>
    /// Test/dev aid: SDZ_AGENT_SETTING_OVERRIDE=&lt;file.json&gt; with {"Parameters":{"KEY":"VALUE"},"Queries":{"entity":"command"}}
    /// replaces parameters (upsert by key) and query commands (by entity) after the setting is fetched.
    /// Lets a developer point a real setting at a local database without editing it on the platform.
    /// </summary>
    private Setting ApplyOverride(Setting setting)
    {
        var path = _env.GetOrNull("SDZ_AGENT_SETTING_OVERRIDE");
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path)) return setting;
        try
        {
            var node = Json.Parse(File.ReadAllText(path)) as System.Text.Json.Nodes.JsonObject;
            if (node is null) return setting;
            if (node["Parameters"] is System.Text.Json.Nodes.JsonObject parameters)
            {
                foreach (var (key, value) in parameters)
                {
                    var text = value?.ToString() ?? "";
                    var existing = setting.Parameters.FirstOrDefault(p => p.Key == key);
                    if (existing is null) setting.Parameters.Add(new Parameter { Key = key, Value = text });
                    else existing.Value = text;
                }
            }
            if (node["Queries"] is System.Text.Json.Nodes.JsonObject queries)
            {
                foreach (var (entity, command) in queries)
                {
                    foreach (var query in setting.Queries.Where(q => q.Entity == entity)) query.Command = command?.ToString() ?? query.Command;
                }
            }
            _logger.Warn($"SETTING OVERRIDE APPLIED FROM {path}");
        }
        catch (Exception e)
        {
            _logger.Error("SETTING OVERRIDE FAILED", e.Message);
        }
        return setting;
    }

    public async Task SendResourceAsync(string resource, object data, int tries = 1, CancellationToken ct = default)
    {
        while (true)
        {
            _logger.Info($"TRYING({tries}) TO SEND RESOURCE {_env.ApiUrl}{resource}");
            try
            {
                await _http.PostAsync<string>($"{_env.ApiUrl}{resource}", data,
                    new RequestOptions { Headers = Headers(), Timeout = _env.ApiRequestTimeout }, ct).ConfigureAwait(false);
                return;
            }
            catch (HttpRequestFailedException error)
            {
                _logger.Error($"TRYING({tries}) TO SEND RESOURCE {_env.ApiUrl}{resource} - {error.Describe()}");
                if (tries <= _env.Retries)
                {
                    await _utils.WaitAsync(Utils.CalculateRetryTime(tries, 60_000), ct).ConfigureAwait(false);
                    tries++;
                    _recorder.RecordRetry();
                    continue;
                }
                throw;
            }
        }
    }

    public async Task TouchSettingAsync(CancellationToken ct = default)
    {
        _logger.Info($"TOUCH SETTING {_env.ApiUrl}settings");
        try
        {
            await _http.PatchAsync<string>($"{_env.ApiUrl}settings", new { },
                new RequestOptions { Headers = Headers(), Timeout = _env.ApiRequestTimeout }, ct).ConfigureAwait(false);
        }
        catch (HttpRequestFailedException error)
        {
            _logger.Error($"TOUCH SETTING {_env.ApiUrl}settings - {error.Describe()}");
        }
    }

    // ---- file logging (logs/agent-yyyy-MM-dd.log, 7 days retention) ----

    public void EnableFileLogging()
    {
        Directory.CreateDirectory(_paths.LogsDir);
        CleanOldLogs();
        _fileLoggingEnabled = true;
    }

    private void CleanOldLogs()
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddDays(-7);
            foreach (var file in Directory.EnumerateFiles(_paths.LogsDir, "agent-*.log"))
            {
                if (File.GetLastWriteTimeUtc(file) < cutoff) File.Delete(file);
            }
        }
        catch
        {
            // silently ignore
        }
    }

    private void WriteLogsToFile(List<string[]> log)
    {
        if (!_fileLoggingEnabled) return;
        try
        {
            var file = Path.Combine(_paths.LogsDir, $"agent-{DateTime.UtcNow:yyyy-MM-dd}.log");
            File.AppendAllLines(file, log.Select(entry => Json.Serialize(entry)));
        }
        catch
        {
            // never block the main flow
        }
    }

    /// <summary>Ships a batch of [level, timestamp, message...] entries to /logs using the base credentials.</summary>
    public async Task<bool> SendLogAsync(List<string[]> log, CancellationToken ct = default)
    {
        WriteLogsToFile(log);

        // not configured yet: nothing to ship to (and nothing worth keeping for a retry)
        if (string.IsNullOrEmpty(_env.BaseApiUrl) || string.IsNullOrEmpty(_env.BaseClientId)) return true;

        var env = _env.IsRedirected ? "SND" : null;
        var payload = env is null
            ? log
            : log.Select(data =>
            {
                var copy = (string[])data.Clone();
                if (copy.Length > 2) copy[2] = $"[{env}] - {copy[2]}";
                return copy;
            }).ToList();

        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await _http.PostAsync<string>($"{_env.BaseApiUrl}logs", payload,
                    new RequestOptions { Headers = LogHeaders(), Timeout = _env.ApiRequestTimeout }, ct).ConfigureAwait(false);
                return true;
            }
            catch (Exception e)
            {
                // transport errors (connection reset, premature EOF) get one quick retry; HTTP errors (401...) do not
                var transport = e is HttpRequestFailedException { StatusCode: null };
                if (transport && attempt < 3)
                {
                    await Task.Delay(500 * attempt, ct).ConfigureAwait(false);
                    continue;
                }
                var detail = e is HttpRequestFailedException h ? h.Body ?? (h.InnerException?.Message is { } inner ? $"{h.Message} ({inner})" : h.Message) : e.Message;
                _logger.LogLocal("error", $"ERROR {_env.BaseApiUrl}logs {detail}");
                return false;
            }
        }
    }
}
