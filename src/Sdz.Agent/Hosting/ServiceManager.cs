using System.Diagnostics;
using Sdz.Agent.Core;

namespace Sdz.Agent.Hosting;

/// <summary>
/// `sdz-agent service install|uninstall|start|stop|status`: registers the agent
/// with the OS service manager. Installers normally do this; the verbs exist
/// for manual setups and support.
/// </summary>
public static class ServiceManager
{
    public const string ServiceName = "SDZ-AGENT";
    public const string DisplayName = "SDZ Agent";

    public static int Run(string action, AgentPaths paths)
    {
        try
        {
            if (OperatingSystem.IsWindows()) return Windows(action, paths);
            if (OperatingSystem.IsMacOS()) return MacOs(action, paths);
            return Linux(action, paths);
        }
        catch (Exception e)
        {
            Console.Error.WriteLine($"✖ {e.Message}");
            return 1;
        }
    }

    private static string Executable => Environment.ProcessPath ?? Path.Combine(AppContext.BaseDirectory, OperatingSystem.IsWindows() ? "sdz-agent.exe" : "sdz-agent");

    private static int Windows(string action, AgentPaths paths)
    {
        switch (action)
        {
            case "install":
                Exec("sc.exe", $"create {ServiceName} binPath= \"\\\"{Executable}\\\" run\" start= delayed-auto DisplayName= \"{DisplayName}\"");
                Exec("sc.exe", $"description {ServiceName} \"Seedz Agent\"");
                Exec("sc.exe", $"failure {ServiceName} reset= 86400 actions= restart/60000/restart/60000/restart/60000");
                Exec("sc.exe", $"start {ServiceName}");
                return 0;
            case "uninstall":
                Exec("sc.exe", $"stop {ServiceName}", ignoreErrors: true);
                Exec("sc.exe", $"delete {ServiceName}");
                return 0;
            case "start": Exec("sc.exe", $"start {ServiceName}"); return 0;
            case "stop": Exec("sc.exe", $"stop {ServiceName}"); return 0;
            case "restart": Exec("sc.exe", $"stop {ServiceName}", ignoreErrors: true); Thread.Sleep(2000); Exec("sc.exe", $"start {ServiceName}"); return 0;
            case "status": Exec("sc.exe", $"query {ServiceName}"); return 0;
            default: throw new ArgumentException($"unknown service action '{action}'");
        }
    }

    private static int Linux(string action, AgentPaths paths)
    {
        const string unitPath = "/etc/systemd/system/sdz-agent.service";
        switch (action)
        {
            case "install":
                File.WriteAllText(unitPath, $"""
                    [Unit]
                    Description={DisplayName}
                    After=network-online.target
                    Wants=network-online.target

                    [Service]
                    Type=notify
                    ExecStart={Executable} run
                    WorkingDirectory={paths.DataDir}
                    Environment={AgentPaths.DataDirVariable}={paths.DataDir}
                    Environment=DOTNET_gcServer=0
                    Restart=always
                    RestartSec=60
                    LimitNOFILE=65536
                    KillSignal=SIGTERM
                    TimeoutStopSec=90

                    [Install]
                    WantedBy=multi-user.target

                    """);
                paths.EnsureDirectories();
                Exec("systemctl", "daemon-reload");
                Exec("systemctl", "enable --now sdz-agent");
                return 0;
            case "uninstall":
                Exec("systemctl", "disable --now sdz-agent", ignoreErrors: true);
                if (File.Exists(unitPath)) File.Delete(unitPath);
                Exec("systemctl", "daemon-reload");
                return 0;
            case "start": Exec("systemctl", "start sdz-agent"); return 0;
            case "stop": Exec("systemctl", "stop sdz-agent"); return 0;
            case "restart": Exec("systemctl", "restart sdz-agent"); return 0;
            case "status": Exec("systemctl", "status sdz-agent --no-pager", ignoreErrors: true); return 0;
            default: throw new ArgumentException($"unknown service action '{action}'");
        }
    }

    private static int MacOs(string action, AgentPaths paths)
    {
        const string plist = "/Library/LaunchDaemons/ag.seedz.sdz-agent.plist";
        switch (action)
        {
            case "install":
                paths.EnsureDirectories();
                File.WriteAllText(plist, $"""
                    <?xml version="1.0" encoding="UTF-8"?>
                    <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
                    <plist version="1.0">
                    <dict>
                      <key>Label</key><string>ag.seedz.sdz-agent</string>
                      <key>ProgramArguments</key><array><string>{Executable}</string><string>run</string></array>
                      <key>EnvironmentVariables</key><dict>
                        <key>{AgentPaths.DataDirVariable}</key><string>{paths.DataDir}</string>
                        <key>SDZ_AGENT_SERVICE</key><string>1</string>
                      </dict>
                      <key>WorkingDirectory</key><string>{paths.DataDir}</string>
                      <key>RunAtLoad</key><true/>
                      <key>KeepAlive</key><true/>
                      <key>StandardOutPath</key><string>{paths.LogsDir}/stdout.log</string>
                      <key>StandardErrorPath</key><string>{paths.LogsDir}/stderr.log</string>
                    </dict>
                    </plist>

                    """);
                Exec("launchctl", $"bootstrap system {plist}");
                return 0;
            case "uninstall":
                Exec("launchctl", $"bootout system {plist}", ignoreErrors: true);
                if (File.Exists(plist)) File.Delete(plist);
                return 0;
            case "start":
            case "restart": Exec("launchctl", "kickstart -k system/ag.seedz.sdz-agent"); return 0;
            case "stop": Exec("launchctl", "kill SIGTERM system/ag.seedz.sdz-agent"); return 0;
            case "status": Exec("launchctl", "print system/ag.seedz.sdz-agent", ignoreErrors: true); return 0;
            default: throw new ArgumentException($"unknown service action '{action}'");
        }
    }

    private static void Exec(string file, string args, bool ignoreErrors = false)
    {
        Console.WriteLine($"> {file} {args}");
        using var process = Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false })!;
        process.WaitForExit();
        if (process.ExitCode != 0 && !ignoreErrors)
        {
            throw new InvalidOperationException($"{file} exited with code {process.ExitCode}");
        }
    }
}
