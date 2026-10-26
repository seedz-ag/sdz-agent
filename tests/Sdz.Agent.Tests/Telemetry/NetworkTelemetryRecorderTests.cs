using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class NetworkTelemetryRecorderTests
{
    private static readonly TelemetryNetwork Empty = new(0, 0, 0, 0, new TelemetryStat(0, 0, 0));

    [Fact]
    public void StartsWithEmptyWindow()
    {
        var recorder = new NetworkTelemetryRecorder();
        Assert.Equal(Empty, recorder.Snapshot());
    }

    [Fact]
    public void CountsByOutcomeAndAggregatesLatency()
    {
        var recorder = new NetworkTelemetryRecorder();
        recorder.RecordRequest(NetworkOutcome.Ok, 10);
        recorder.RecordRequest(NetworkOutcome.Ok, 20);
        recorder.RecordRequest(NetworkOutcome.Error, 30);
        recorder.RecordRequest(NetworkOutcome.Timeout, 40);
        recorder.RecordRetry();
        recorder.RecordRetry();

        var snapshot = recorder.Snapshot();
        Assert.Equal(4, snapshot.Requests);
        Assert.Equal(1, snapshot.Errors);
        Assert.Equal(1, snapshot.Timeouts);
        Assert.Equal(2, snapshot.Retries);
        Assert.Equal(25, snapshot.LatencyMs.Avg, 5);
        Assert.Equal(40, snapshot.LatencyMs.Max);
    }

    [Fact]
    public void ResetsAfterSnapshot()
    {
        var recorder = new NetworkTelemetryRecorder();
        recorder.RecordRequest(NetworkOutcome.Ok, 100);
        recorder.RecordRetry();
        recorder.Snapshot();
        Assert.Equal(Empty, recorder.Snapshot());
    }

    [Fact]
    public void ClampsNegativeLatencies()
    {
        var recorder = new NetworkTelemetryRecorder();
        recorder.RecordRequest(NetworkOutcome.Ok, -5);
        Assert.Equal(0, recorder.Snapshot().LatencyMs.Avg);
    }
}
