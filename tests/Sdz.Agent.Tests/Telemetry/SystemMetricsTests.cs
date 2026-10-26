using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class SystemMetricsTests
{
    private readonly SystemMetrics _metrics = new();

    [Fact]
    public void CpuPercentBetween_FromDeltas() =>
        Assert.Equal(75, _metrics.CpuPercentBetween(new CpuTimes(100, 200), new CpuTimes(150, 400)), 5);

    [Fact]
    public void CpuPercentBetween_FullyIdle() =>
        Assert.Equal(0, _metrics.CpuPercentBetween(new CpuTimes(100, 200), new CpuTimes(200, 300)));

    [Fact]
    public void CpuPercentBetween_ZeroOrNegativeTotalDelta()
    {
        Assert.Equal(0, _metrics.CpuPercentBetween(new CpuTimes(10, 10), new CpuTimes(10, 10)));
        Assert.Equal(0, _metrics.CpuPercentBetween(new CpuTimes(10, 20), new CpuTimes(5, 15)));
    }

    [Fact]
    public void CpuPercentBetween_Clamped() =>
        Assert.True(_metrics.CpuPercentBetween(new CpuTimes(0, 0), new CpuTimes(-10, 10)) <= 100);

    [Fact]
    public void ParseMemAvailable_FromMeminfo()
    {
        var meminfo = string.Join("\n", "MemTotal:       16384000 kB", "MemFree:         1000000 kB", "MemAvailable:    5000000 kB", "Buffers:          200000 kB");
        Assert.Equal(5_000_000L * 1024, SystemMetrics.ParseMemAvailable(meminfo));
    }

    [Fact]
    public void ParseMemAvailable_MissingIsNull() => Assert.Null(SystemMetrics.ParseMemAvailable("MemTotal: 16384000 kB\n"));

    [Fact]
    public void ParseProcStat_MirrorsNodeTotals()
    {
        var times = SystemMetrics.ParseProcStat("cpu  100 5 50 800 20 3 2 0 0 0\ncpu0 1 2 3 4 5 6 7 8 9 10\n");
        Assert.Equal(800, times.Idle);
        Assert.Equal(100 + 5 + 50 + 800 + 3, times.Total);
    }

    [Fact]
    public void GetDiskStats_ReturnsZerosForInvalidPath()
    {
        var stats = _metrics.GetDiskStats(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString(), "nope"));
        Assert.True(stats.TotalBytes >= 0 && stats.FreeBytes >= 0);
    }

    [Fact]
    public void GetDiskStats_ForTempDir()
    {
        var stats = _metrics.GetDiskStats(Path.GetTempPath());
        Assert.True(stats.TotalBytes > 0);
        Assert.True(stats.FreeBytes <= stats.TotalBytes);
    }

    [Fact]
    public void GetOsName_IsOneOfKnown() =>
        Assert.Contains(_metrics.GetOsName(), new[] { "windows", "linux", "darwin", "freebsd" });

    [Fact]
    public void GetTimezone_MatchesLocal()
    {
        var tz = _metrics.GetTimezone();
        Assert.False(string.IsNullOrWhiteSpace(tz));
        if (!OperatingSystem.IsWindows()) Assert.Equal(TimeZoneInfo.Local.Id, tz);
    }

    [Fact]
    public void GetUtcOffsetMinutes_MatchesLocal() =>
        Assert.Equal((int)TimeZoneInfo.Local.GetUtcOffset(DateTime.UtcNow).TotalMinutes, _metrics.GetUtcOffsetMinutes());

    [Fact]
    public void LiveSamples_AreSane()
    {
        Assert.True(_metrics.GetCpuCount() > 0);
        Assert.True(_metrics.GetMemTotalBytes() > 0);
        Assert.True(_metrics.GetMemFreeBytes() >= 0);
        var times = _metrics.SampleCpuTimes();
        Assert.True(times.Total >= times.Idle);
    }
}
