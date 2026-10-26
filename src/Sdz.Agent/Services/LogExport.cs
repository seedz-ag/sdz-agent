using System.Text;
using Sdz.Agent.Core;

namespace Sdz.Agent.Services;

/// <summary>Reads every logs/agent-*.log (oldest first) as "timestamp level message" lines for export.</summary>
public static class LogExport
{
    public const int MaxLines = 200_000;

    public static string DefaultFileName() => $"sdz-agent-logs-{DateTime.Now:yyyyMMdd-HHmmss}.txt";

    /// <summary>Throws UnauthorizedAccessException when the logs folder cannot be read (caller may fall back to the service).</summary>
    public static List<string> ReadAll(AgentPaths paths, int maxLines = MaxLines)
    {
        var lines = new List<string>();
        if (!Directory.Exists(paths.LogsDir)) return lines;
        foreach (var file in Directory.EnumerateFiles(paths.LogsDir, "agent-*.log").OrderBy(f => f, StringComparer.Ordinal))
        {
            foreach (var raw in File.ReadLines(file))
            {
                if (string.IsNullOrWhiteSpace(raw)) continue;
                lines.Add(Format(raw));
            }
        }
        return lines.Count > maxLines ? lines.GetRange(lines.Count - maxLines, maxLines) : lines;
    }

    /// <summary>Stored lines are JSON arrays [level, timestamp, message...].</summary>
    public static string Format(string raw)
    {
        try
        {
            var arr = Json.Deserialize<string[]>(raw);
            if (arr is { Length: >= 3 }) return $"{arr[1]} {arr[0],5} {string.Join(" ", arr.Skip(2))}";
        }
        catch { }
        return raw;
    }

    public static async Task WriteAsync(Stream target, IReadOnlyCollection<string> lines, string? header = null)
    {
        await using var writer = new StreamWriter(target, new UTF8Encoding(false)) { NewLine = Environment.NewLine };
        await writer.WriteLineAsync($"# SDZ Agent {Utils.Version} - logs exportados em {DateTime.Now:yyyy-MM-dd HH:mm:ss} ({lines.Count} linhas)").ConfigureAwait(false);
        if (!string.IsNullOrEmpty(header)) await writer.WriteLineAsync($"# {header}").ConfigureAwait(false);
        foreach (var line in lines) await writer.WriteLineAsync(line).ConfigureAwait(false);
    }
}
