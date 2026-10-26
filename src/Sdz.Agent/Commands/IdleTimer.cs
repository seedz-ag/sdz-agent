namespace Sdz.Agent.Commands;

/// <summary>
/// Idle shutdown for console sessions (port of idle-timer.service.ts, PR #158).
///
/// An installed agent listens forever; a SAAS console session comes up so someone can investigate,
/// and a forgotten one is an idle task holding a customer's CLIENT_ID/CLIENT_SECRET.
///
/// Ping is NOT activity: the API emits one every 30 s, so resetting on it would keep a forgotten
/// session alive forever. Activity means an effective command (Query, Execute, Shell, Update...);
/// Response is excluded too (it is what the agent sends back, not someone on the other end).
/// </summary>
public sealed class IdleTimer : IDisposable
{
    private static readonly HashSet<string> Heartbeat = new(StringComparer.Ordinal) { "Ping", "ListActiveClients", "Response" };

    private readonly TimeSpan _ttl;
    private readonly Action<TimeSpan> _onExpire;
    private readonly Func<DateTimeOffset> _now;
    private readonly object _lock = new();
    private Timer? _timer;
    private DateTimeOffset _lastActivity;
    private bool _stopped;

    /// <summary>Minutes as given by --session-ttl / SESSION_TTL (at least one minute, like the Node agent).</summary>
    public static IdleTimer FromMinutes(double minutes, Action<TimeSpan> onExpire, Func<DateTimeOffset>? now = null) =>
        new(TimeSpan.FromMinutes(Math.Max(1, minutes)), onExpire, now);

    /// <summary>Exact duration (tests).</summary>
    public IdleTimer(TimeSpan ttl, Action<TimeSpan> onExpire, Func<DateTimeOffset>? now = null)
    {
        _ttl = ttl;
        _onExpire = onExpire;
        _now = now ?? (() => DateTimeOffset.UtcNow);
        _lastActivity = _now();
    }

    public static bool IsActivity(string? command) => !string.IsNullOrEmpty(command) && !Heartbeat.Contains(command);

    public TimeSpan IdleFor => _now() - _lastActivity;

    public IdleTimer Start()
    {
        lock (_lock) Schedule();
        return this;
    }

    /// <summary>Called for every stream message; only an effective command resets the clock.</summary>
    public bool Touch(string? command)
    {
        if (!IsActivity(command)) return false;
        lock (_lock)
        {
            if (_stopped) return false;
            _lastActivity = _now();
            Schedule();
        }
        return true;
    }

    public void Stop()
    {
        lock (_lock)
        {
            _stopped = true;
            _timer?.Dispose();
            _timer = null;
        }
    }

    public void Dispose() => Stop();

    private void Schedule()
    {
        if (_stopped) return;
        _timer?.Dispose();
        _timer = new Timer(_ =>
        {
            lock (_lock) { if (_stopped) return; }
            _onExpire(IdleFor);
        }, null, _ttl, Timeout.InfiniteTimeSpan);
    }
}
