namespace Sdz.Agent.Control;

/// <summary>Where the service listens: a named pipe on Windows, a unix socket elsewhere.</summary>
public static class ControlEndpoint
{
    public const string PipeName = "sdz-agent-control";
    public const string EnvironmentVariable = "SDZ_AGENT_CONTROL";
    public const string SystemSocketDir = "/run/sdz-agent";

    public static string SystemSocketPath => Path.Combine(SystemSocketDir, "control.sock");

    /// <summary>Socket path the service should bind: $SDZ_AGENT_CONTROL, else /run/sdz-agent when writable, else the data dir.</summary>
    public static string ServerSocketPath(string dataDir)
    {
        var fromEnv = Environment.GetEnvironmentVariable(EnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(fromEnv)) return fromEnv;
        try
        {
            if (!Directory.Exists(SystemSocketDir) && Environment.UserName == "root") Directory.CreateDirectory(SystemSocketDir);
            if (Directory.Exists(SystemSocketDir))
            {
                var probe = Path.Combine(SystemSocketDir, ".probe");
                File.WriteAllText(probe, "");
                File.Delete(probe);
                return SystemSocketPath;
            }
        }
        catch { }
        var local = Path.Combine(dataDir, "control.sock");
        // unix socket paths are limited to ~108 bytes
        return local.Length <= 100 ? local : FallbackSocketPath;
    }

    public static string FallbackSocketPath => Path.Combine(Path.GetTempPath(), $"sdz-agent-{Environment.UserName}.sock");

    /// <summary>Candidate socket paths a client tries, in order.</summary>
    public static IEnumerable<string> ClientSocketCandidates()
    {
        var fromEnv = Environment.GetEnvironmentVariable(EnvironmentVariable);
        if (!string.IsNullOrWhiteSpace(fromEnv)) yield return fromEnv;
        yield return SystemSocketPath;
        yield return "/var/lib/sdz-agent/control.sock";
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        yield return Path.Combine(home, ".sdz-agent", "control.sock");
        yield return FallbackSocketPath;
    }
}
