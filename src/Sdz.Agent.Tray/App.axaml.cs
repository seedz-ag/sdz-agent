using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.ApplicationLifetimes;
using Avalonia.Markup.Xaml;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Avalonia.Threading;
using Sdz.Agent.Control;

namespace Sdz.Agent.Tray;

public sealed class App : Application
{
    private readonly ControlClient _client = new() { Timeout = TimeSpan.FromSeconds(15) };
    private TrayIcon? _tray;
    private NativeMenuItem? _statusItem;
    private NativeMenuItem? _runItem;
    private NativeMenuItem? _autostartItem;
    private MainWindow? _window;
    private DispatcherTimer? _timer;
    private string _currentIcon = "";

    public AgentStatus? Status { get; private set; }
    public string? ConnectionError { get; private set; }
    public event Action? StatusChanged;

    public override void Initialize() => AvaloniaXamlLoader.Load(this);

    public override void OnFrameworkInitializationCompleted()
    {
        _statusItem = new NativeMenuItem("Conectando ao serviço…") { IsEnabled = false };
        _runItem = new NativeMenuItem("Executar extração agora");
        _runItem.Click += async (_, _) => await RunNowAsync();
        var open = new NativeMenuItem("Abrir painel…");
        open.Click += (_, _) => ShowWindow();
        var logs = new NativeMenuItem("Abrir pasta de logs");
        logs.Click += (_, _) => OpenDataDir();
        var clear = new NativeMenuItem("Limpar logs");
        clear.Click += async (_, _) => await ClearLogsAsync();
        var export = new NativeMenuItem("Exportar logs…");
        export.Click += async (_, _) => { ShowWindow(); if (_window is not null) await _window.ExportLogsAsync(); };
        _autostartItem = new NativeMenuItem("Iniciar com o sistema") { ToggleType = NativeMenuItemToggleType.CheckBox, IsChecked = AutoStart.IsEnabled() };
        _autostartItem.Click += (_, _) => { AutoStart.Set(!AutoStart.IsEnabled()); _autostartItem!.IsChecked = AutoStart.IsEnabled(); };
        var quit = new NativeMenuItem("Sair");
        quit.Click += (_, _) => Shutdown();

        var menu = new NativeMenu();
        menu.Items.Add(_statusItem);
        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(open);
        menu.Items.Add(_runItem);
        menu.Items.Add(logs);
        menu.Items.Add(export);
        menu.Items.Add(clear);
        menu.Items.Add(new NativeMenuItemSeparator());
        menu.Items.Add(_autostartItem);
        menu.Items.Add(quit);

        _tray = new TrayIcon { ToolTipText = "SDZ Agent", Menu = menu, IsVisible = true };
        _tray.Clicked += (_, _) => ShowWindow();
        SetIcon("tray-off");
        TrayIcon.SetIcons(this, new TrayIcons { _tray });

        _timer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(10) };
        _timer.Tick += async (_, _) => await RefreshAsync();
        _timer.Start();
        _ = RefreshAsync();

        if (Environment.GetCommandLineArgs().Contains("--show") || !AutoStart.IsEnabled() || Status is null)
        {
            // first run (not yet auto-starting) opens the panel so the user can enter the credentials
            if (!AutoStart.IsEnabled()) ShowWindow();
        }

        base.OnFrameworkInitializationCompleted();
    }

    public async Task RefreshAsync()
    {
        try
        {
            var response = await _client.StatusAsync();
            Status = response.Status;
            ConnectionError = response.Ok ? null : response.Message;
        }
        catch (Exception e)
        {
            Status = null;
            ConnectionError = e.Message;
        }
        UpdateTray();
        StatusChanged?.Invoke();
    }

    private void UpdateTray()
    {
        if (_statusItem is null || _tray is null) return;
        string icon, text;
        if (Status is null)
        {
            icon = "tray-off"; text = "Serviço parado ou inacessível";
        }
        else if (!Status.Configured)
        {
            icon = "tray-warn"; text = "Credenciais não configuradas";
        }
        else if (!Status.AuthOk || !string.IsNullOrEmpty(Status.LastError))
        {
            icon = "tray-warn"; text = Status.LastError ?? "Falha de autenticação";
        }
        else if (Status.Running)
        {
            icon = "tray-ok"; text = "Extração em andamento…";
        }
        else
        {
            icon = "tray-ok";
            text = Status.NextRunAt is { } n ? $"Ativo · próxima extração {n:dd/MM HH:mm}" : "Ativo";
        }
        _statusItem.Header = text;
        _tray.ToolTipText = $"SDZ Agent · {text}";
        if (_runItem is not null) _runItem.IsEnabled = Status is { Configured: true, Running: false };
        SetIcon(icon);
    }

    private void SetIcon(string name)
    {
        if (_tray is null || _currentIcon == name) return;
        _currentIcon = name;
        using var stream = AssetLoader.Open(new Uri($"avares://sdz-agent-tray/Assets/{name}.png"));
        _tray.Icon = new WindowIcon(new Bitmap(stream));
    }

    public async Task<ControlResponse> ConfigureAsync(string clientId, string secret, string? apiUrl)
    {
        try
        {
            var response = await new ControlClient { Timeout = TimeSpan.FromSeconds(60) }.ConfigureAsync(clientId, secret, apiUrl);
            await RefreshAsync();
            return response;
        }
        catch (Exception e)
        {
            return ControlResponse.Failure(e.Message);
        }
    }

    public async Task<ControlResponse> RunNowAsync()
    {
        try
        {
            var response = await _client.RunAsync();
            await RefreshAsync();
            return response;
        }
        catch (Exception e)
        {
            return ControlResponse.Failure(e.Message);
        }
    }

    public async Task<ControlResponse> ClearLogsAsync()
    {
        try { return await _client.ClearLogsAsync(); }
        catch (Exception e) { return ControlResponse.Failure(e.Message); }
    }

    public async Task<ControlResponse> ExportLogsAsync()
    {
        try { return await new ControlClient { Timeout = TimeSpan.FromSeconds(60) }.ExportLogsAsync(); }
        catch (Exception e) { return ControlResponse.Failure(e.Message); }
    }

    public async Task<List<string>> LogsAsync(int lines = 200)
    {
        try { return (await _client.LogsAsync(lines)).Logs ?? new List<string>(); }
        catch (Exception e) { return new List<string> { e.Message }; }
    }

    public void ShowWindow()
    {
        if (_window is null || !_window.IsVisible)
        {
            _window = new MainWindow(this);
            _window.Closed += (_, _) => _window = null;
            _window.Show();
        }
        // bring it in front of whatever is open (focus-stealing prevention on Linux ignores a plain Activate)
        var window = _window;
        window.Topmost = true;
        window.Activate();
        DispatcherTimer.RunOnce(() => { if (window.IsVisible) window.Topmost = false; }, TimeSpan.FromMilliseconds(800));
    }

    public void OpenDataDir()
    {
        var dir = Status?.DataDir ?? DefaultDataDir();
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = OperatingSystem.IsWindows() ? "explorer.exe" : OperatingSystem.IsMacOS() ? "open" : "xdg-open",
                Arguments = $"\"{Path.Combine(dir, "logs")}\"",
                UseShellExecute = false,
            });
        }
        catch { }
    }

    public static string DefaultDataDir() =>
        OperatingSystem.IsWindows()
            ? AppContext.BaseDirectory.TrimEnd(Path.DirectorySeparatorChar) // tray and service share the install folder
            : "/var/lib/sdz-agent";

    private void Shutdown()
    {
        _timer?.Stop();
        if (_tray is not null) _tray.IsVisible = false;
        if (ApplicationLifetime is IClassicDesktopStyleApplicationLifetime desktop) desktop.Shutdown();
    }
}
