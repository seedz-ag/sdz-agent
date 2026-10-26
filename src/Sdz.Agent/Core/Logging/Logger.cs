using System.Threading.Channels;

namespace Sdz.Agent.Core.Logging;

public sealed record LogEntry(string Timestamp, string Level, object?[] Args, bool LocalOnly = false)
{
    /// <summary>[timestamp, level, ...args] as strings, the shape the Node agent persisted/sent.</summary>
    public string[] ToArray()
    {
        var result = new string[Args.Length + 2];
        result[0] = Timestamp;
        result[1] = Level;
        for (var i = 0; i < Args.Length; i++) result[i + 2] = Stringify(Args[i]);
        return result;
    }

    public static string Stringify(object? arg) => arg switch
    {
        null => "null",
        string s => s,
        Exception e => e.Message,
        _ => Json.Serialize(arg),
    };
}

public interface ILogSink
{
    void Write(LogEntry entry);
}

/// <summary>Port of LoggerAdapter: a readable stream of log entries fanned out to sinks.</summary>
public sealed class Logger
{
    private readonly List<ILogSink> _sinks = new();
    private readonly object _lock = new();

    public void Attach(ILogSink sink)
    {
        lock (_lock) _sinks.Add(sink);
    }

    public void Detach(ILogSink sink)
    {
        lock (_lock) _sinks.Remove(sink);
    }

    public void Log(string level, params object?[] args) => Push(new LogEntry(Now(), level, args));

    /// <summary>Log that must not be shipped to the API (used by the API sink itself).</summary>
    public void LogLocal(string level, params object?[] args) => Push(new LogEntry(Now(), level, args, LocalOnly: true));

    public void Info(params object?[] args) => Log("info", args);
    public void Warn(params object?[] args) => Log("warn", args);
    public void Error(params object?[] args) => Log("error", args);

    private void Push(LogEntry entry)
    {
        ILogSink[] sinks;
        lock (_lock) sinks = _sinks.ToArray();
        foreach (var sink in sinks)
        {
            try { sink.Write(entry); } catch { /* a sink must never break the agent */ }
        }
    }

    private static string Now() => DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss");
}

public sealed class ConsoleLogSink : ILogSink
{
    private static readonly object Gate = new();

    public void Write(LogEntry entry)
    {
        var color = entry.Level switch
        {
            "error" => ConsoleColor.Red,
            "warn" => ConsoleColor.Yellow,
            _ => ConsoleColor.Blue,
        };
        var level = (" " + entry.Level)[^Math.Min(5, entry.Level.Length + 1)..];
        var message = string.Join(" ", entry.Args.Select(LogEntry.Stringify));

        lock (Gate)
        {
            var previous = Console.ForegroundColor;
            try
            {
                Console.ForegroundColor = color;
                Console.Write($"{entry.Timestamp} {level,5}");
            }
            finally
            {
                Console.ForegroundColor = previous;
            }
            Console.WriteLine(" " + message);
        }
    }
}

/// <summary>
/// Port of APILoggerAdapter: buffers entries and ships them to /logs in pages of
/// 100; whatever fails to ship is appended to output/yyyy-MM-dd.log so that
/// LogsService.ConsumeOutput can retry on the next run.
/// </summary>
public sealed class ApiLogSink : ILogSink, IAsyncDisposable
{
    private readonly Channel<LogEntry> _channel = Channel.CreateUnbounded<LogEntry>();
    private readonly Func<List<string[]>, Task<bool>> _ship;
    private readonly AgentPaths _paths;
    private readonly Task _pump;
    private int _pending;

    public int Pending => Volatile.Read(ref _pending);

    public ApiLogSink(AgentPaths paths, Func<List<string[]>, Task<bool>> ship)
    {
        _paths = paths;
        _ship = ship;
        _pump = Task.Run(PumpAsync);
    }

    public void Write(LogEntry entry)
    {
        if (entry.LocalOnly) return;
        Interlocked.Increment(ref _pending);
        _channel.Writer.TryWrite(entry);
    }

    private async Task PumpAsync()
    {
        var reader = _channel.Reader;
        while (await reader.WaitToReadAsync().ConfigureAwait(false))
        {
            var batch = new List<LogEntry>(100);
            while (batch.Count < 100 && reader.TryRead(out var entry)) batch.Add(entry);
            if (batch.Count == 0) continue;

            // the API expects [level, timestamp, ...args]
            var payload = batch.Select(e =>
            {
                var arr = e.ToArray();
                (arr[0], arr[1]) = (arr[1], arr[0]);
                return arr;
            }).ToList();

            var ok = false;
            try { ok = await _ship(payload).ConfigureAwait(false); }
            catch { ok = false; }

            if (!ok) WriteToFile(batch);
            Interlocked.Add(ref _pending, -batch.Count);
        }
    }

    private void WriteToFile(IEnumerable<LogEntry> entries)
    {
        try
        {
            Directory.CreateDirectory(_paths.OutputDir);
            var file = _paths.Output($"{DateTime.Now:yyyy-MM-dd}.log");
            File.AppendAllLines(file, entries.Select(e => Json.Serialize(e.ToArray())));
        }
        catch
        {
            // nothing else we can do
        }
    }

    /// <summary>Waits until everything queued so far was shipped (or persisted).</summary>
    public async Task FlushAsync(TimeSpan? timeout = null)
    {
        var deadline = DateTime.UtcNow + (timeout ?? TimeSpan.FromMinutes(2));
        while (Pending > 0 && DateTime.UtcNow < deadline)
        {
            await Task.Delay(200).ConfigureAwait(false);
        }
    }

    public async ValueTask DisposeAsync()
    {
        _channel.Writer.TryComplete();
        try { await _pump.ConfigureAwait(false); } catch { }
    }
}
