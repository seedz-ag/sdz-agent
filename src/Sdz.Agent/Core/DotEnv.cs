using System.Text;

namespace Sdz.Agent.Core;

/// <summary>Minimal .env reader/writer compatible with the files the Node agent produced.</summary>
public static class DotEnv
{
    public static Dictionary<string, string> Read(string path)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        if (!File.Exists(path)) return result;

        foreach (var raw in File.ReadAllLines(path))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#')) continue;
            if (line.StartsWith("export ", StringComparison.Ordinal)) line = line[7..].TrimStart();

            var eq = line.IndexOf('=');
            if (eq <= 0) continue;

            var key = line[..eq].Trim();
            var value = line[(eq + 1)..].Trim();

            if (value.Length >= 2 && (value[0] == '"' || value[0] == '\''))
            {
                var quote = value[0];
                var end = value.LastIndexOf(quote);
                if (end > 0)
                {
                    value = value[1..end];
                    if (quote == '"') value = value.Replace("\\n", "\n");
                }
            }
            else
            {
                var hash = value.IndexOf(" #", StringComparison.Ordinal);
                if (hash >= 0) value = value[..hash].TrimEnd();
            }

            result[key] = value;
        }

        return result;
    }

    public static void Write(string path, IEnumerable<KeyValuePair<string, string>> values)
    {
        var sb = new StringBuilder();
        foreach (var (key, value) in values)
        {
            var needsQuote = value.Any(c => char.IsWhiteSpace(c) || c == '#' || c == '"');
            sb.Append(key).Append('=');
            sb.Append(needsQuote ? $"\"{value.Replace("\"", "\\\"")}\"" : value);
            sb.Append('\n');
        }

        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        RestrictPermissions(path);
    }

    /// <summary>Group allowed to read the .env (same group as the control socket).</summary>
    public const string GroupName = "sdz-agent";

    /// <summary>0600, or 0640 root:sdz-agent when written by root and the group exists (tray/CLI users in the group can read it).</summary>
    private static void RestrictPermissions(string path)
    {
        if (OperatingSystem.IsWindows()) return;
        try
        {
            var shared = Environment.UserName == "root" && ChangeGroup(path, GroupName);
            File.SetUnixFileMode(path, shared
                ? UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.GroupRead
                : UnixFileMode.UserRead | UnixFileMode.UserWrite);
        }
        catch
        {
            // best effort
        }
    }

    private static bool ChangeGroup(string path, string group)
    {
        try
        {
            using var p = System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo("chgrp", $"{group} \"{path}\"")
            { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true });
            p!.WaitForExit(5000);
            return p.ExitCode == 0;
        }
        catch { return false; }
    }
}
