namespace Sdz.Agent.Telemetry;

public sealed record TelemetryStat(double Avg, double Max, double P95);
public sealed record TelemetryMemStat(double Avg, double Min, double P95);

/// <summary>Port of TelemetryStatsService.</summary>
public static class TelemetryStats
{
    public static double Average(IReadOnlyList<double> values) => values.Count == 0 ? 0 : values.Average();
    public static double Max(IReadOnlyList<double> values) => values.Count == 0 ? 0 : values.Max();
    public static double Min(IReadOnlyList<double> values) => values.Count == 0 ? 0 : values.Min();

    /// <summary>Linear-interpolation percentile (R-7 / Excel method).</summary>
    public static double Percentile(IReadOnlyList<double> values, double p)
    {
        if (values.Count == 0) return 0;
        var sorted = values.OrderBy(v => v).ToArray();
        if (sorted.Length == 1) return sorted[0];
        var rank = (p / 100) * (sorted.Length - 1);
        var lower = (int)Math.Floor(rank);
        var upper = (int)Math.Ceiling(rank);
        if (lower == upper) return sorted[lower];
        var weight = rank - lower;
        return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
    }

    public static TelemetryStat AggregateAvgMaxP95(IReadOnlyList<double> values) =>
        new(Average(values), Max(values), Percentile(values, 95));

    public static TelemetryMemStat AggregateAvgMinP95(IReadOnlyList<double> values) =>
        new(Average(values), Min(values), Percentile(values, 95));
}
