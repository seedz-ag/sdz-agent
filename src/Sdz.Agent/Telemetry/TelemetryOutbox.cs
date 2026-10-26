using Sdz.Agent.Core;

namespace Sdz.Agent.Telemetry;

/// <summary>
/// Port of TelemetryOutboxAdapter: append-only local WAL for telemetry snapshots.
/// The agent runs on-premise and may be offline for a while, so snapshots are
/// persisted before being shipped; the shipper drains this file in a single
/// batched POST and only removes the lines that were actually accepted.
/// </summary>
public class TelemetryOutbox
{
    public const int DefaultMaxLines = 240;

    private readonly object _lock = new();

    public string Path { get; }
    public int MaxLines { get; }

    public TelemetryOutbox(AgentPaths paths) : this(System.IO.Path.Combine(paths.OutputDir, "telemetry-outbox.jsonl"), DefaultMaxLines) { }

    public TelemetryOutbox(string path, int maxLines)
    {
        Path = path;
        MaxLines = maxLines;
    }

    public virtual void Append(IReadOnlyList<object?> entries)
    {
        if (entries.Count == 0) return;
        lock (_lock)
        {
            EnsureDir();
            File.AppendAllLines(Path, entries.Select(e => Json.Serialize(e)));
            Trim();
        }
    }

    public virtual List<string> ReadAll()
    {
        lock (_lock)
        {
            if (!File.Exists(Path)) return new List<string>();
            return File.ReadAllLines(Path).Where(line => line.Trim().Length > 0).ToList();
        }
    }

    public virtual void RemoveFirst(int count)
    {
        if (count <= 0) return;
        lock (_lock)
        {
            Write(ReadAll().Skip(count).ToList());
        }
    }

    private void Trim()
    {
        var lines = ReadAll();
        if (lines.Count > MaxLines) Write(lines.Skip(lines.Count - MaxLines).ToList());
    }

    private void Write(List<string> lines)
    {
        EnsureDir();
        File.WriteAllText(Path, lines.Count > 0 ? string.Join("\n", lines) + "\n" : "");
    }

    private void EnsureDir()
    {
        var dir = System.IO.Path.GetDirectoryName(Path);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
    }
}
