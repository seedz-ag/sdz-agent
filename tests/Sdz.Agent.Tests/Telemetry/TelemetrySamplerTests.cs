using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class TelemetrySamplerTests
{
    private sealed class FakeMetrics : SystemMetrics
    {
        public Queue<CpuTimes> CpuTimesSequence { get; } = new();
        public Queue<long> MemFree { get; } = new();
        public int SampleCalls { get; private set; }

        public override CpuTimes SampleCpuTimes()
        {
            SampleCalls++;
            return CpuTimesSequence.Count > 0 ? CpuTimesSequence.Dequeue() : new CpuTimes(0, 0);
        }

        public override long GetMemFreeBytes() => MemFree.Count > 0 ? MemFree.Dequeue() : 0;
    }

    [Fact]
    public void ZeroedAggregatesWithoutTicks()
    {
        var sampler = new TelemetrySampler(new FakeMetrics());
        var snapshot = sampler.Snapshot();
        Assert.Equal(new TelemetryStat(0, 0, 0), snapshot.CpuPercent);
        Assert.Equal(new TelemetryMemStat(0, 0, 0), snapshot.MemFreeBytes);
    }

    [Fact]
    public void AccumulatesAcrossTicksAndAggregates()
    {
        var metrics = new FakeMetrics();
        foreach (var t in new[] { new CpuTimes(0, 0), new CpuTimes(10, 100), new CpuTimes(30, 200), new CpuTimes(60, 300) })
            metrics.CpuTimesSequence.Enqueue(t);
        foreach (var m in new long[] { 1000, 500, 800 }) metrics.MemFree.Enqueue(m);

        var sampler = new TelemetrySampler(metrics);
        sampler.Start(); // baseline
        sampler.Tick();  // 90%
        sampler.Tick();  // 80%
        sampler.Tick();  // 70%
        sampler.Stop();

        var snapshot = sampler.Snapshot();
        Assert.Equal(80, snapshot.CpuPercent.Avg, 5);
        Assert.Equal(90, snapshot.CpuPercent.Max, 5);
        Assert.Equal((1000 + 500 + 800) / 3.0, snapshot.MemFreeBytes.Avg, 5);
        Assert.Equal(500, snapshot.MemFreeBytes.Min);
    }

    [Fact]
    public void ResetsWindowAfterSnapshot()
    {
        var metrics = new FakeMetrics();
        metrics.CpuTimesSequence.Enqueue(new CpuTimes(0, 0));
        metrics.CpuTimesSequence.Enqueue(new CpuTimes(50, 100));
        metrics.MemFree.Enqueue(42);

        var sampler = new TelemetrySampler(metrics);
        sampler.Start();
        sampler.Tick();
        sampler.Stop();
        sampler.Snapshot();

        var next = sampler.Snapshot();
        Assert.Equal(new TelemetryStat(0, 0, 0), next.CpuPercent);
        Assert.Equal(new TelemetryMemStat(0, 0, 0), next.MemFreeBytes);
    }

    [Fact]
    public void StartIsIdempotent()
    {
        var metrics = new FakeMetrics();
        var sampler = new TelemetrySampler(metrics);
        sampler.Start();
        sampler.Start();
        sampler.Stop();
        Assert.Equal(1, metrics.SampleCalls);
    }
}
