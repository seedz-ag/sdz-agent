namespace Sdz.Agent.Telemetry;

public enum NetworkOutcome { Ok, Error, Timeout }

public sealed record TelemetryNetwork(int Requests, int Errors, int Timeouts, int Retries, TelemetryStat LatencyMs);

/// <summary>Port of NetworkTelemetryRecorderService: passively observes real HTTP traffic.</summary>
public sealed class NetworkTelemetryRecorder
{
    private readonly object _lock = new();
    private int _requests, _errors, _timeouts, _retries;
    private List<double> _latencies = new();

    public void RecordRequest(NetworkOutcome outcome, double latencyMs)
    {
        lock (_lock)
        {
            _requests++;
            _latencies.Add(Math.Max(0, latencyMs));
            if (outcome == NetworkOutcome.Timeout) _timeouts++;
            else if (outcome == NetworkOutcome.Error) _errors++;
        }
    }

    public void RecordRetry()
    {
        lock (_lock) _retries++;
    }

    public TelemetryNetwork Snapshot()
    {
        lock (_lock)
        {
            var network = new TelemetryNetwork(_requests, _errors, _timeouts, _retries, TelemetryStats.AggregateAvgMaxP95(_latencies));
            ResetUnsafe();
            return network;
        }
    }

    public void Reset()
    {
        lock (_lock) ResetUnsafe();
    }

    private void ResetUnsafe()
    {
        _requests = _errors = _timeouts = _retries = 0;
        _latencies = new List<double>();
    }
}
