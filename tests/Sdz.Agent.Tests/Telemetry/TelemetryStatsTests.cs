using Sdz.Agent.Telemetry;
using Xunit;

namespace Sdz.Agent.Tests.Telemetry;

public class TelemetryStatsTests
{
    [Fact]
    public void AverageMaxMin_ReturnZeroForEmpty()
    {
        var empty = Array.Empty<double>();
        Assert.Equal(0, TelemetryStats.Average(empty));
        Assert.Equal(0, TelemetryStats.Max(empty));
        Assert.Equal(0, TelemetryStats.Min(empty));
    }

    [Fact]
    public void AverageMaxMin_OverWindow()
    {
        double[] samples = { 10, 20, 30, 40 };
        Assert.Equal(25, TelemetryStats.Average(samples));
        Assert.Equal(40, TelemetryStats.Max(samples));
        Assert.Equal(10, TelemetryStats.Min(samples));
    }

    [Fact]
    public void Percentile_EmptyIsZero() => Assert.Equal(0, TelemetryStats.Percentile(Array.Empty<double>(), 95));

    [Fact]
    public void Percentile_SingleValue() => Assert.Equal(42, TelemetryStats.Percentile(new double[] { 42 }, 95));

    [Fact]
    public void Percentile_LinearlyInterpolatesP95()
    {
        double[] samples = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
        Assert.Equal(9.55, TelemetryStats.Percentile(samples, 95), 5);
    }

    [Fact]
    public void Percentile_InsensitiveToOrder()
    {
        double[] ordered = { 1, 2, 3, 4, 5, 6, 7, 8, 9, 10 };
        double[] shuffled = { 7, 2, 10, 4, 1, 9, 3, 6, 8, 5 };
        Assert.Equal(TelemetryStats.Percentile(ordered, 95), TelemetryStats.Percentile(shuffled, 95), 5);
    }

    [Fact]
    public void AggregateAvgMaxP95()
    {
        var aggregate = TelemetryStats.AggregateAvgMaxP95(new double[] { 10, 20, 30, 40, 50 });
        Assert.Equal(30, aggregate.Avg);
        Assert.Equal(50, aggregate.Max);
        Assert.True(aggregate.P95 >= aggregate.Avg);
    }

    [Fact]
    public void AggregateAvgMinP95()
    {
        var aggregate = TelemetryStats.AggregateAvgMinP95(new double[] { 100, 200, 300, 400, 500 });
        Assert.Equal(300, aggregate.Avg);
        Assert.Equal(100, aggregate.Min);
        Assert.True(aggregate.P95 >= aggregate.Avg);
    }
}
