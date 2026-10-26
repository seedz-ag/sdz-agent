using System.Diagnostics;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Sdz.Agent.Api;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;

namespace Sdz.Agent.Telemetry;

public enum TelemetryMode { Scheduler, Listen }

public sealed class TelemetryAgentInfo
{
    [JsonPropertyName("name")] public string Name { get; set; } = "sdz-agent";
    [JsonPropertyName("version")] public string Version { get; set; } = "";
    [JsonPropertyName("mode")] public string Mode { get; set; } = "scheduler";
}

public sealed class TelemetryHostInfo
{
    [JsonPropertyName("hostname")] public string Hostname { get; set; } = "";
    [JsonPropertyName("os")] public string Os { get; set; } = "";
    [JsonPropertyName("osVersion")] public string OsVersion { get; set; } = "";
    [JsonPropertyName("arch")] public string Arch { get; set; } = "";
    [JsonPropertyName("timezone")] public string Timezone { get; set; } = "";
    [JsonPropertyName("utcOffsetMinutes")] public int UtcOffsetMinutes { get; set; }
    /// <summary>Local clock minus the API's Date header at the last successful ship; null until then.</summary>
    [JsonPropertyName("clockDriftMs")] public long? ClockDriftMs { get; set; }
}

public sealed class TelemetryRuntimeInfo
{
    [JsonPropertyName("startedAt")] public string StartedAt { get; set; } = "";
    [JsonPropertyName("uptimeSec")] public long UptimeSec { get; set; }
}

public sealed class TelemetryStatJson
{
    [JsonPropertyName("avg")] public double Avg { get; set; }
    [JsonPropertyName("max")] public double Max { get; set; }
    [JsonPropertyName("p95")] public double P95 { get; set; }
    public static TelemetryStatJson From(TelemetryStat s) => new() { Avg = s.Avg, Max = s.Max, P95 = s.P95 };
}

public sealed class TelemetryMemStatJson
{
    [JsonPropertyName("avg")] public double Avg { get; set; }
    [JsonPropertyName("min")] public double Min { get; set; }
    [JsonPropertyName("p95")] public double P95 { get; set; }
    public static TelemetryMemStatJson From(TelemetryMemStat s) => new() { Avg = s.Avg, Min = s.Min, P95 = s.P95 };
}

public sealed class TelemetryResources
{
    [JsonPropertyName("cpuCount")] public int CpuCount { get; set; }
    [JsonPropertyName("cpuPercent")] public TelemetryStatJson CpuPercent { get; set; } = new();
    [JsonPropertyName("memTotalBytes")] public long MemTotalBytes { get; set; }
    [JsonPropertyName("memFreeBytes")] public TelemetryMemStatJson MemFreeBytes { get; set; } = new();
    [JsonPropertyName("diskTotalBytes")] public long DiskTotalBytes { get; set; }
    [JsonPropertyName("diskFreeBytes")] public long DiskFreeBytes { get; set; }
}

public sealed class TelemetryNetworkJson
{
    [JsonPropertyName("requests")] public int Requests { get; set; }
    [JsonPropertyName("errors")] public int Errors { get; set; }
    [JsonPropertyName("timeouts")] public int Timeouts { get; set; }
    [JsonPropertyName("retries")] public int Retries { get; set; }
    [JsonPropertyName("latencyMs")] public TelemetryStatJson LatencyMs { get; set; } = new();
    public static TelemetryNetworkJson From(TelemetryNetwork n) => new()
    {
        Requests = n.Requests, Errors = n.Errors, Timeouts = n.Timeouts, Retries = n.Retries,
        LatencyMs = TelemetryStatJson.From(n.LatencyMs),
    };
}

/// <summary>v1 telemetry envelope; serializes to the exact shape of ITelemetryPayload.</summary>
public sealed class TelemetryPayload
{
    [JsonPropertyName("schemaVersion")] public int SchemaVersion { get; set; } = 1;
    [JsonPropertyName("agent")] public TelemetryAgentInfo Agent { get; set; } = new();
    [JsonPropertyName("host")] public TelemetryHostInfo Host { get; set; } = new();
    [JsonPropertyName("runtime")] public TelemetryRuntimeInfo Runtime { get; set; } = new();
    [JsonPropertyName("windowSeconds")] public int WindowSeconds { get; set; }
    [JsonPropertyName("resources")] public TelemetryResources Resources { get; set; } = new();
    [JsonPropertyName("network")] public TelemetryNetworkJson Network { get; set; } = new();
    [JsonPropertyName("workload")] public Dictionary<string, object?> Workload { get; set; } = new();
    [JsonPropertyName("collectedAt")] public string CollectedAt { get; set; } = "";
}

/// <summary>
/// Port of TelemetryService: windowed system+network telemetry collector.
/// Every WindowSeconds it snapshots the CPU/memory sampler and the passive
/// network recorder, builds a v1 envelope, appends it to a local WAL and
/// best-effort ships the outstanding WAL entries in a single batched POST.
/// Shipping never throws: failures are logged and the WAL is kept.
/// </summary>
public sealed class TelemetryService
{
    public const int WindowSeconds = 60;

    private readonly AgentEnvironment _env;
    private readonly AgentPaths _paths;
    private readonly Logger _logger;
    private readonly NetworkTelemetryRecorder _recorder;
    private readonly TelemetryOutbox _outbox;
    private readonly TelemetrySampler _sampler;
    private readonly SystemMetrics _metrics;
    private readonly object _lock = new();
    private readonly SemaphoreSlim _shipGate = new(1, 1);

    private CancellationTokenSource? _windowCts;
    private TelemetryMode _mode = TelemetryMode.Scheduler;
    private DateTimeOffset _startedAt = DateTimeOffset.UtcNow;
    private Dictionary<string, object?> _workload = new();
    private long? _clockDriftMs;

    /// <summary>Shipping function; tests substitute it. Defaults to HttpClientAdapter.PostRawAsync.</summary>
    internal Func<string, object?, RequestOptions, CancellationToken, Task<HttpResult>> PostRaw { get; set; }

    /// <summary>Clock used for clockDrift computation; tests substitute it.</summary>
    internal Func<DateTimeOffset> Now { get; set; } = () => DateTimeOffset.UtcNow;

    public TelemetryService(
        AgentEnvironment env,
        AgentPaths paths,
        HttpClientAdapter http,
        Logger logger,
        NetworkTelemetryRecorder recorder,
        TelemetryOutbox outbox,
        TelemetrySampler sampler,
        SystemMetrics metrics)
    {
        _env = env;
        _paths = paths;
        _logger = logger;
        _recorder = recorder;
        _outbox = outbox;
        _sampler = sampler;
        _metrics = metrics;
        PostRaw = (url, payload, options, ct) => http.PostRawAsync(url, payload, options, ct);
    }

    public bool IsEnabled() => _env.TelemetryEnabled;

    public bool IsRunning() => _windowCts is not null;

    /// <summary>
    /// Starts the collector for the given long-running mode. Idempotent: once
    /// started, further calls are a no-op, so a scheduler that also spins up
    /// the listen loop keeps reporting mode "scheduler".
    /// </summary>
    public void Start(TelemetryMode mode)
    {
        try
        {
            lock (_lock)
            {
                if (!IsEnabled() || _windowCts is not null) return;

                _mode = mode;
                _startedAt = DateTimeOffset.UtcNow;
                _recorder.Reset();
                _sampler.Start();

                _windowCts = new CancellationTokenSource();
                var token = _windowCts.Token;
                _ = Task.Run(async () =>
                {
                    using var timer = new PeriodicTimer(TimeSpan.FromSeconds(WindowSeconds));
                    try
                    {
                        while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false))
                        {
                            await CollectAndShipAsync(token).ConfigureAwait(false);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // stopped
                    }
                }, token);
            }
        }
        catch (Exception error)
        {
            _logger.Error("TELEMETRY START FAILED", error.Message);
        }
    }

    public void Stop()
    {
        lock (_lock)
        {
            _sampler.Stop();
            if (_windowCts is null) return;
            _windowCts.Cancel();
            _windowCts.Dispose();
            _windowCts = null;
        }
    }

    public void SetWorkloadContext(IDictionary<string, object?> patch)
    {
        lock (_lock)
        {
            var merged = new Dictionary<string, object?>(_workload);
            foreach (var (key, value) in patch) merged[key] = value;
            _workload = merged;
        }
    }

    public async Task CollectAndShipAsync(CancellationToken ct = default)
    {
        try
        {
            var payload = BuildPayload();
            _outbox.Append(new object?[] { payload });
        }
        catch (Exception error)
        {
            _logger.Error("TELEMETRY COLLECT FAILED", error.Message);
        }

        await ShipAsync(ct).ConfigureAwait(false);
    }

    internal TelemetryPayload BuildPayload()
    {
        var sample = _sampler.Snapshot();
        var network = _recorder.Snapshot();
        var disk = _metrics.GetDiskStats(_paths.DataDir);
        var now = DateTimeOffset.UtcNow;

        return new TelemetryPayload
        {
            SchemaVersion = 1,
            Agent = new TelemetryAgentInfo { Name = "sdz-agent", Version = Utils.Version, Mode = ModeName(_mode) },
            Host = new TelemetryHostInfo
            {
                Hostname = _metrics.GetHostname(),
                Os = _metrics.GetOsName(),
                OsVersion = _metrics.GetOsVersion(),
                Arch = _metrics.GetArch(),
                Timezone = _metrics.GetTimezone(),
                UtcOffsetMinutes = _metrics.GetUtcOffsetMinutes(),
                ClockDriftMs = _clockDriftMs,
            },
            Runtime = new TelemetryRuntimeInfo
            {
                StartedAt = Iso(_startedAt),
                UptimeSec = (long)Math.Round(ProcessUptime().TotalSeconds),
            },
            WindowSeconds = WindowSeconds,
            Resources = new TelemetryResources
            {
                CpuCount = _metrics.GetCpuCount(),
                CpuPercent = TelemetryStatJson.From(sample.CpuPercent),
                MemTotalBytes = _metrics.GetMemTotalBytes(),
                MemFreeBytes = TelemetryMemStatJson.From(sample.MemFreeBytes),
                DiskTotalBytes = disk.TotalBytes,
                DiskFreeBytes = disk.FreeBytes,
            },
            Network = TelemetryNetworkJson.From(network),
            Workload = BuildWorkload(),
            CollectedAt = Iso(now),
        };
    }

    private Dictionary<string, object?> BuildWorkload()
    {
        Dictionary<string, object?> workload;
        lock (_lock) workload = new Dictionary<string, object?>(_workload);
        workload["listen"] = _mode == TelemetryMode.Listen || _env.Listen;
        workload["outputBacklog"] = GetOutputBacklog();
        return workload;
    }

    private Dictionary<string, object?> GetOutputBacklog()
    {
        try
        {
            var outboxPath = Path.GetFullPath(_outbox.Path);
            var files = Directory.Exists(_paths.OutputDir)
                ? Directory.EnumerateFiles(_paths.OutputDir)
                    .Where(f => !Path.GetFileName(f).StartsWith('.') && Path.GetFullPath(f) != outboxPath)
                    .ToList()
                : new List<string>();
            long bytes = 0;
            foreach (var file in files)
            {
                try { bytes += new FileInfo(file).Length; } catch { }
            }
            return new Dictionary<string, object?> { ["files"] = files.Count, ["bytes"] = bytes };
        }
        catch
        {
            return new Dictionary<string, object?> { ["files"] = 0, ["bytes"] = 0L };
        }
    }

    private async Task ShipAsync(CancellationToken ct)
    {
        if (!await _shipGate.WaitAsync(0, ct).ConfigureAwait(false)) return;
        try
        {
            var lines = _outbox.ReadAll();
            if (lines.Count == 0) return;

            var batch = lines.Select(line => JsonNode.Parse(line)).ToList();
            var requestSentAt = Now();

            var result = await PostRaw(
                $"{_env.ApiUrl}telemetry",
                batch,
                new RequestOptions { Headers = Headers(), Timeout = _env.ApiRequestTimeout },
                ct).ConfigureAwait(false);

            UpdateClockDrift(result.Headers.Date, requestSentAt);
            _outbox.RemoveFirst(lines.Count);
        }
        catch (Exception error) when (error is not OperationCanceledException || !ct.IsCancellationRequested)
        {
            _logger.Warn("TELEMETRY SHIP FAILED, KEEPING OUTBOX FOR RETRY", error.Message);
        }
        finally
        {
            _shipGate.Release();
        }
    }

    /// <summary>
    /// Derives clock drift from the API's Date response header. Attributes the
    /// full round-trip to the local->server leg (a slight overestimate), fine
    /// for spotting gross drift but not a precise offset.
    /// </summary>
    private void UpdateClockDrift(DateTimeOffset? serverDate, DateTimeOffset requestSentAt)
    {
        if (serverDate is null) return;
        _clockDriftMs = (long)Math.Round((requestSentAt - serverDate.Value).TotalMilliseconds);
    }

    private Dictionary<string, string> Headers() => new()
    {
        ["Authorization"] = ApiService.BasicAuth(_env.ClientId, _env.ClientSecret),
        ["sdz-request-id"] = Guid.NewGuid().ToString(),
    };

    private static string ModeName(TelemetryMode mode) => mode == TelemetryMode.Listen ? "listen" : "scheduler";

    private static string Iso(DateTimeOffset value) => value.UtcDateTime.ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'");

    private static TimeSpan ProcessUptime()
    {
        try { return DateTime.Now - Process.GetCurrentProcess().StartTime; }
        catch { return TimeSpan.FromMilliseconds(Environment.TickCount64); }
    }
}
