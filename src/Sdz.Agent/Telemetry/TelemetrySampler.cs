namespace Sdz.Agent.Telemetry;

public sealed record TelemetrySamplerSnapshot(TelemetryStat CpuPercent, TelemetryMemStat MemFreeBytes);

/// <summary>
/// Port of TelemetrySamplerService: ticks roughly every second, capturing a CPU%
/// sample (time deltas) and an available-memory sample. Samples accumulate for
/// the duration of a collection window so peaks aren't missed; Snapshot()
/// reduces them to avg/max/p95 (mem uses min) and resets the window.
/// </summary>
public class TelemetrySampler
{
    public const int SampleIntervalMs = 1_000;

    private readonly SystemMetrics _metrics;
    private readonly object _lock = new();
    private CancellationTokenSource? _cts;
    private CpuTimes? _previous;
    private List<double> _cpuPercentSamples = new();
    private List<double> _memFreeSamples = new();

    public TelemetrySampler(SystemMetrics metrics)
    {
        _metrics = metrics;
    }

    public bool IsRunning => _cts is not null;

    public virtual void Start()
    {
        lock (_lock)
        {
            if (_cts is not null) return;
            _previous = _metrics.SampleCpuTimes();
            _cts = new CancellationTokenSource();
            var token = _cts.Token;
            _ = Task.Run(async () =>
            {
                using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(SampleIntervalMs));
                try
                {
                    while (await timer.WaitForNextTickAsync(token).ConfigureAwait(false))
                    {
                        try { Tick(); } catch { /* sampling must never crash the agent */ }
                    }
                }
                catch (OperationCanceledException)
                {
                    // stopped
                }
            }, token);
        }
    }

    public virtual void Stop()
    {
        lock (_lock)
        {
            if (_cts is null) return;
            _cts.Cancel();
            _cts.Dispose();
            _cts = null;
        }
    }

    public virtual void Tick()
    {
        var current = _metrics.SampleCpuTimes();
        lock (_lock)
        {
            if (_previous is { } previous)
            {
                _cpuPercentSamples.Add(_metrics.CpuPercentBetween(previous, current));
            }
            _previous = current;
            _memFreeSamples.Add(_metrics.GetMemFreeBytes());
        }
    }

    public virtual TelemetrySamplerSnapshot Snapshot()
    {
        lock (_lock)
        {
            var snapshot = new TelemetrySamplerSnapshot(
                TelemetryStats.AggregateAvgMaxP95(_cpuPercentSamples),
                TelemetryStats.AggregateAvgMinP95(_memFreeSamples));
            _cpuPercentSamples = new List<double>();
            _memFreeSamples = new List<double>();
            return snapshot;
        }
    }
}
