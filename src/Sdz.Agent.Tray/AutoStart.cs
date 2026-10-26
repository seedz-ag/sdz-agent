namespace Sdz.Agent.Tray;

/// <summary>Per-user "start at login": HKCU Run key on Windows, XDG autostart on Linux, LaunchAgent on macOS.</summary>
public static class AutoStart
{
    private const string Name = "SdzAgentTray";
    private static string Exe => Environment.ProcessPath ?? "";

    private static string LinuxDesktop => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "autostart", "sdz-agent-tray.desktop");
    private static string MacPlist => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Library", "LaunchAgents", "ag.seedz.sdz-agent-tray.plist");

    public static bool IsEnabled()
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
                return key?.GetValue(Name) is string;
            }
            if (OperatingSystem.IsMacOS()) return File.Exists(MacPlist);
            return File.Exists(LinuxDesktop) || File.Exists("/etc/xdg/autostart/sdz-agent-tray.desktop");
        }
        catch { return false; }
    }

    public static void Set(bool enabled)
    {
        try
        {
            if (OperatingSystem.IsWindows())
            {
                using var key = Microsoft.Win32.Registry.CurrentUser.CreateSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run");
                if (enabled) key.SetValue(Name, $"\"{Exe}\""); else key.DeleteValue(Name, false);
                return;
            }
            if (OperatingSystem.IsMacOS())
            {
                if (!enabled) { File.Delete(MacPlist); return; }
                Directory.CreateDirectory(Path.GetDirectoryName(MacPlist)!);
                File.WriteAllText(MacPlist, $"""
                    <?xml version="1.0" encoding="UTF-8"?>
                    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                    <plist version="1.0"><dict>
                      <key>Label</key><string>ag.seedz.sdz-agent-tray</string>
                      <key>ProgramArguments</key><array><string>{Exe}</string></array>
                      <key>RunAtLoad</key><true/>
                    </dict></plist>
                    """);
                return;
            }
            if (!enabled)
            {
                // a system-wide autostart entry can only be disabled with a user override marked Hidden
                Directory.CreateDirectory(Path.GetDirectoryName(LinuxDesktop)!);
                File.WriteAllText(LinuxDesktop, "[Desktop Entry]\nType=Application\nName=SDZ Agent\nHidden=true\n");
                return;
            }
            Directory.CreateDirectory(Path.GetDirectoryName(LinuxDesktop)!);
            File.WriteAllText(LinuxDesktop, $"""
                [Desktop Entry]
                Type=Application
                Name=SDZ Agent
                Comment=Seedz integration agent tray
                Exec={Exe}
                Icon=sdz-agent
                Terminal=false
                X-GNOME-Autostart-enabled=true

                """);
        }
        catch { }
    }
}
