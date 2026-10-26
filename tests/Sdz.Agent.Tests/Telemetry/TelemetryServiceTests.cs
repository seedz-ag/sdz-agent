using System.Net.Http.Headers;
using System.Text.Json.Nodes;
using Sdz.Agent.Core;
using Sdz.Agent.Core.Http;
using Sdz.Agent.Core.Logging;
using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class TelemetryServiceTests : IDisposable
{
    private sealed class FakeMetrics : SystemMetrics
    {
        public bool ThrowOnDisk { get; set; }
        public override DiskStats GetDiskStats(string path) => ThrowOnDisk ? throw new InvalidOperationException("boom") : new DiskStats(500_000, 200_000);
        public override string GetHostname() => "agent-host";
        public override string GetOsName() => "linux";
        public override string GetOsVersion() => "5.15.0";
        public override string GetArch() => "x64";
        public override string GetTimezone() => "America/Sao_Paulo";
        public override int GetUtcOffsetMinutes() => -180;
        public override int GetCpuCount() => 4;
        public override long GetMemTotalBytes() => 8_000_000;
        public override long GetMemFreeBytes() => 1_000;
        public override CpuTimes SampleCpuTimes() => new(0, 0);
    }

    private sealed class FakeSampler : TelemetrySampler
    {
        public int Starts { get; private set; }
        public FakeSampler() : base(new FakeMetrics()) { }
        public override void Start() => Starts++;
        public override void Stop() { }
        public override TelemetrySamplerSnapshot Snapshot() =>
            new(new TelemetryStat(10, 30, 25), new TelemetryMemStat(1_000, 500, 900));
    }

    private sealed class CaptureSink : ILogSink
    {
        public List<LogEntry> Entries { get; } = new();
        public void Write(LogEntry entry) { lock (Entries) Entries.Add(entry); }
    }

    private readonly string _tmp = Directory.CreateTempSubdirectory("sdz-agent-telemetry-").FullName;
    private readonly AgentEnvironment _env;
    private readonly TelemetryOutbox _outbox;
    private readonly FakeSampler _sampler;
    private readonly FakeMetrics _metrics = new();
    private readonly NetworkTelemetryRecorder _recorder = new();
    private readonly CaptureSink _sink = new();
    private readonly TelemetryService _service;
    private readonly List<(string Url, JsonNode Body, RequestOptions Options)> _posts = new();
    private Func<HttpResult> _respond = () => Result(null);

    public TelemetryServiceTests()
    {
        var paths = new AgentPaths(_tmp);
        paths.EnsureDirectories();
        DotEnv.Write(paths.EnvFile, new Dictionary<string, string>
        {
            ["API_URL"] = "https://api.example.com/",
            ["CLIENT_ID"] = "the-client-id",
            ["CLIENT_SECRET"] = "the-client-secret",
        });
        _env = new AgentEnvironment(paths);
        _outbox = new TelemetryOutbox(paths);
        _sampler = new FakeSampler();
        var logger = new Logger();
        logger.Attach(_sink);
        _service = new TelemetryService(_env, paths, new HttpClientAdapter(_recorder), logger, _recorder, _outbox, _sampler, _metrics)
        {
            PostRaw = (url, body, options, _) =>
            {
                _posts.Add((url, Json.ToNode(body)!, options));
                return Task.FromResult(_respond());
            },
        };
    }

    public void Dispose()
    {
        _service.Stop();
        Directory.Delete(_tmp, recursive: true);
    }

    private static HttpResult Result(DateTimeOffset? date)
    {
        var response = new HttpResponseMessage { Content = new StringContent("") };
        if (date is not null) response.Headers.Date = date;
        return new HttpResult("", response.Headers, response.Content.Headers, 200);
    }

    private void Record3Requests()
    {
        _recorder.RecordRequest(NetworkOutcome.Ok, 12);
        _recorder.RecordRequest(NetworkOutcome.Ok, 12);
        _recorder.RecordRequest(NetworkOutcome.Ok, 12);
    }

    // ---- TELEMETRY=off ----

    [Fact]
    public void Off_IsDisabled()
    {
        _env.Set("TELEMETRY", "off");
        Assert.False(_service.IsEnabled());
    }

    [Fact]
    public void Off_IsCaseInsensitiveAndTrimmed()
    {
        _env.Set("TELEMETRY", " OFF ");
        Assert.False(_service.IsEnabled());
    }

    [Fact]
    public void Off_StartIsNoOp()
    {
        _env.Set("TELEMETRY", "off");
        _service.Start(TelemetryMode.Scheduler);
        Assert.False(_service.IsRunning());
        Assert.Equal(0, _sampler.Starts);
    }

    [Fact]
    public void EnabledByDefaultAndForOtherValues()
    {
        Assert.True(_service.IsEnabled());
        _env.Set("TELEMETRY", "on");
        Assert.True(_service.IsEnabled());
    }

    // ---- start ----

    [Fact]
    public void Start_StartsSamplerAndRuns()
    {
        _service.Start(TelemetryMode.Listen);
        Assert.Equal(1, _sampler.Starts);
        Assert.True(_service.IsRunning());
    }

    [Fact]
    public async Task Start_IsIdempotent()
    {
        _service.Start(TelemetryMode.Scheduler);
        _service.Start(TelemetryMode.Listen);
        Assert.Equal(1, _sampler.Starts);

        await _service.CollectAndShipAsync();
        var body = _posts.Single().Body.AsArray();
        Assert.Equal("scheduler", body[0]!["agent"]!["mode"]!.GetValue<string>());
    }

    // ---- collectAndShip ----

    [Fact]
    public async Task BuildsV1EnvelopeAppendsAndShips()
    {
        _service.Start(TelemetryMode.Scheduler);
        Record3Requests();

        await _service.CollectAndShipAsync();

        var batch = _posts.Single().Body.AsArray();
        Assert.Single(batch);
        var payload = batch[0]!;

        Assert.Equal(1, payload["schemaVersion"]!.GetValue<int>());
        Assert.Equal("sdz-agent", payload["agent"]!["name"]!.GetValue<string>());
        Assert.Equal(Utils.Version, payload["agent"]!["version"]!.GetValue<string>());
        Assert.Equal("scheduler", payload["agent"]!["mode"]!.GetValue<string>());

        var host = payload["host"]!;
        Assert.Equal("agent-host", host["hostname"]!.GetValue<string>());
        Assert.Equal("linux", host["os"]!.GetValue<string>());
        Assert.Equal("5.15.0", host["osVersion"]!.GetValue<string>());
        Assert.Equal("x64", host["arch"]!.GetValue<string>());
        Assert.Equal("America/Sao_Paulo", host["timezone"]!.GetValue<string>());
        Assert.Equal(-180, host["utcOffsetMinutes"]!.GetValue<int>());
        Assert.True(host.AsObject().ContainsKey("clockDriftMs"));
        Assert.Null(host["clockDriftMs"]);

        Assert.Equal(60, payload["windowSeconds"]!.GetValue<int>());

        var resources = payload["resources"]!;
        Assert.Equal(4, resources["cpuCount"]!.GetValue<int>());
        Assert.Equal(10, resources["cpuPercent"]!["avg"]!.GetValue<double>());
        Assert.Equal(30, resources["cpuPercent"]!["max"]!.GetValue<double>());
        Assert.Equal(25, resources["cpuPercent"]!["p95"]!.GetValue<double>());
        Assert.Equal(8_000_000, resources["memTotalBytes"]!.GetValue<long>());
        Assert.Equal(1_000, resources["memFreeBytes"]!["avg"]!.GetValue<double>());
        Assert.Equal(500, resources["memFreeBytes"]!["min"]!.GetValue<double>());
        Assert.Equal(900, resources["memFreeBytes"]!["p95"]!.GetValue<double>());
        Assert.Equal(500_000, resources["diskTotalBytes"]!.GetValue<long>());
        Assert.Equal(200_000, resources["diskFreeBytes"]!.GetValue<long>());

        var network = payload["network"]!;
        Assert.Equal(3, network["requests"]!.GetValue<int>());
        Assert.Equal(0, network["errors"]!.GetValue<int>());
        Assert.Equal(0, network["timeouts"]!.GetValue<int>());
        Assert.Equal(0, network["retries"]!.GetValue<int>());
        Assert.Equal(12, network["latencyMs"]!["avg"]!.GetValue<double>());

        Assert.IsType<string>(payload["runtime"]!["startedAt"]!.GetValue<string>());
        Assert.True(payload["runtime"]!["uptimeSec"]!.GetValue<long>() >= 0);
        Assert.IsType<string>(payload["collectedAt"]!.GetValue<string>());
        Assert.NotNull(payload["workload"]!.AsObject());
        Assert.False(payload["workload"]!["listen"]!.GetValue<bool>());
        Assert.Equal(0, payload["workload"]!["outputBacklog"]!["files"]!.GetValue<int>());

        // drained on success
        Assert.Empty(_outbox.ReadAll());
    }

    [Fact]
    public async Task ShipsOutboxAsSingleArrayPostWithAuthHeaders()
    {
        _outbox.Append(new object?[] { new { schemaVersion = 1, foo = "bar" } });
        // CollectAndShip appends the current window too, so both entries ship in one batch

        await _service.CollectAndShipAsync();

        var (url, body, options) = _posts.Single();
        Assert.Equal("https://api.example.com/telemetry", url);
        var batch = body.AsArray();
        Assert.Equal(2, batch.Count);
        Assert.Equal("bar", batch[0]!["foo"]!.GetValue<string>());

        var expectedAuth = "Basic " + Convert.ToBase64String(System.Text.Encoding.UTF8.GetBytes("the-client-id:the-client-secret"));
        Assert.Equal(expectedAuth, options.Headers!["Authorization"]);
        Assert.Matches("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options.Headers["sdz-request-id"]);
        Assert.Equal(300_000, options.Timeout);

        Assert.Empty(_outbox.ReadAll());
    }

    [Fact]
    public async Task DerivesClockDriftFromDateHeader()
    {
        var now = new DateTimeOffset(2026, 1, 1, 0, 0, 0, TimeSpan.Zero);
        _service.Now = () => now;
        _respond = () => Result(now.AddSeconds(-5)); // server 5s behind

        await _service.CollectAndShipAsync();
        _respond = () => Result(null);
        await _service.CollectAndShipAsync();

        var second = _posts[1].Body.AsArray()[0]!;
        Assert.Equal(5_000, second["host"]!["clockDriftMs"]!.GetValue<long>());
    }

    [Fact]
    public async Task ClockDriftStaysNullWithoutDateHeader()
    {
        await _service.CollectAndShipAsync();
        await _service.CollectAndShipAsync();
        Assert.Null(_posts[1].Body.AsArray()[0]!["host"]!["clockDriftMs"]);
    }

    [Fact]
    public async Task NoHttpCallWhenOutboxEmpty()
    {
        _metrics.ThrowOnDisk = true; // payload build fails -> nothing appended
        await _service.CollectAndShipAsync();
        Assert.Empty(_posts);
    }

    [Fact]
    public async Task ShippingFailureIsLoggedAndWalKept()
    {
        _respond = () => throw new HttpRequestFailedException("network down", null, null, null, "ECONNREFUSED");

        await _service.CollectAndShipAsync();

        Assert.Single(_outbox.ReadAll());
        Assert.Contains(_sink.Entries, e => e.Level == "warn" && LogEntry.Stringify(e.Args[0]).Contains("TELEMETRY SHIP FAILED"));
    }

    [Fact]
    public async Task NeverThrowsWhenPayloadBuildFails()
    {
        _metrics.ThrowOnDisk = true;
        await _service.CollectAndShipAsync();
        Assert.Contains(_sink.Entries, e => e.Level == "error" && LogEntry.Stringify(e.Args[0]).Contains("TELEMETRY COLLECT FAILED"));
    }

    [Fact]
    public async Task WorkloadContextIsMergedIntoPayload()
    {
        _service.SetWorkloadContext(new Dictionary<string, object?> { ["schedules"] = new[] { "* * * * *" } });
        _service.SetWorkloadContext(new Dictionary<string, object?> { ["lastExecutionAt"] = "2026-01-01T00:00:00.000Z" });

        await _service.CollectAndShipAsync();

        var workload = _posts.Single().Body.AsArray()[0]!["workload"]!;
        Assert.Equal("* * * * *", workload["schedules"]![0]!.GetValue<string>());
        Assert.Equal("2026-01-01T00:00:00.000Z", workload["lastExecutionAt"]!.GetValue<string>());
    }
}
