using Avalonia;

namespace Sdz.Agent.Tray;

public static class Program
{
    [STAThread]
    public static int Main(string[] args)
    {
        using var mutex = new Mutex(true, "Global\\sdz-agent-tray", out var createdNew);
        if (!createdNew) return 0; // already running in this session

        return BuildAvaloniaApp().StartWithClassicDesktopLifetime(args, Avalonia.Controls.ShutdownMode.OnExplicitShutdown);
    }

    public static AppBuilder BuildAvaloniaApp() =>
        AppBuilder.Configure<App>()
            .UsePlatformDetect()
            // WM_CLASS/app id must match the .desktop file (StartupWMClass) so GNOME/KDE show the right icon
            .With(new X11PlatformOptions { WmClass = "sdz-agent-tray" })
            .WithInterFont()
            .LogToTrace();
}
