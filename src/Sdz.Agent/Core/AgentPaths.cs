using System.Runtime.InteropServices;

namespace Sdz.Agent.Core;

/// <summary>
/// Resolves where the agent lives (read-only program files) and where it keeps
/// its mutable state (.env, output/, logs/). The data directory is resolved once
/// per process:
///   1. SDZ_AGENT_DATA_DIR environment variable, when set;
///   2. Windows: the installation folder itself (next to sdz-agent.exe), so everything the
///      agent produces (.env, output\, logs\, updates\) stays where it was installed; a .env left
///      by an older build in %ProgramData%\SEEDZ\sdz-agent is copied over once;
///   3. elsewhere: the current directory when it already contains a .env (dev / legacy layout),
///      then /var/lib/sdz-agent when it exists or can be created, otherwise ~/.sdz-agent.
/// </summary>
public sealed class AgentPaths
{
    public const string DataDirVariable = "SDZ_AGENT_DATA_DIR";

    public string AppDir { get; }
    public string DataDir { get; }
    public string OutputDir => Path.Combine(DataDir, "output");
    public string LogsDir => Path.Combine(DataDir, "logs");
    public string EnvFile => Path.Combine(DataDir, ".env");
    public string UpdatesDir => Path.Combine(DataDir, "updates");

    public AgentPaths() : this(ResolveDataDir()) { }

    public AgentPaths(string dataDir)
    {
        AppDir = AppContext.BaseDirectory;
        DataDir = Path.GetFullPath(dataDir);
    }

    public void EnsureDirectories()
    {
        Directory.CreateDirectory(DataDir);
        Directory.CreateDirectory(OutputDir);
        Directory.CreateDirectory(LogsDir);
    }

    public string Output(string fileName) => Path.Combine(OutputDir, fileName);

    public static string ResolveDataDir()
    {
        var fromEnv = Environment.GetEnvironmentVariable(DataDirVariable);
        if (!string.IsNullOrWhiteSpace(fromEnv))
        {
            return fromEnv;
        }

        if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
        {
            // a Windows service starts with C:\Windows\System32 as its current directory, so the
            // current directory is never used there: everything lives in the installation folder
            var installDir = WindowsInstallDir();
            MigrateLegacyWindowsEnv(installDir);
            return installDir;
        }

        var cwd = Directory.GetCurrentDirectory();
        if (File.Exists(Path.Combine(cwd, ".env")))
        {
            return cwd;
        }

        const string systemDir = "/var/lib/sdz-agent";
        if (IsUsable(systemDir))
        {
            return systemDir;
        }

        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".sdz-agent");
    }

    /// <summary>Folder of sdz-agent.exe (single-file publish) — the install folder chosen in the installer.</summary>
    public static string WindowsInstallDir()
    {
        var exe = Environment.ProcessPath;
        var dir = string.IsNullOrEmpty(exe) ? AppContext.BaseDirectory : Path.GetDirectoryName(exe)!;
        return Path.GetFullPath(dir).TrimEnd(Path.DirectorySeparatorChar);
    }

    /// <summary>Data dir used by builds before 3.0.0 on Windows.</summary>
    public static string LegacyWindowsDataDir() =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), "SEEDZ", "sdz-agent");

    private static void MigrateLegacyWindowsEnv(string installDir)
    {
        try
        {
            var target = Path.Combine(installDir, ".env");
            var legacy = Path.Combine(LegacyWindowsDataDir(), ".env");
            if (File.Exists(target) || !File.Exists(legacy)) return;
            File.Copy(legacy, target);
        }
        catch
        {
            // best effort: the agent simply starts unconfigured
        }
    }

    private static bool IsUsable(string dir)
    {
        try
        {
            if (!Directory.Exists(dir))
            {
                // only root can create it; a regular user falls back to ~/.sdz-agent
                if (Environment.UserName != "root") return false;
                Directory.CreateDirectory(dir);
            }
            var probe = Path.Combine(dir, ".write-probe");
            File.WriteAllText(probe, "");
            File.Delete(probe);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
