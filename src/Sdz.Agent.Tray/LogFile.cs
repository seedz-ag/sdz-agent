using System.Text;

namespace Sdz.Agent.Tray;

/// <summary>Writes exported log lines (the tray does not reference the agent assembly).</summary>
public static class LogFile
{
    public static async Task WriteAsync(Stream target, IReadOnlyCollection<string> lines, string? header)
    {
        await using var writer = new StreamWriter(target, new UTF8Encoding(false)) { NewLine = Environment.NewLine };
        await writer.WriteLineAsync($"# SDZ Agent - logs exportados em {DateTime.Now:yyyy-MM-dd HH:mm:ss} ({lines.Count} linhas)");
        if (!string.IsNullOrEmpty(header)) await writer.WriteLineAsync($"# {header}");
        foreach (var line in lines) await writer.WriteLineAsync(line);
    }
}
