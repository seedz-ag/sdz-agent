using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Documents;
using Avalonia.Controls.Primitives;
using Avalonia.Layout;
using Avalonia.Media;
using Avalonia.Media.Imaging;
using Avalonia.Platform;
using Sdz.Agent.Control;

namespace Sdz.Agent.Tray;

using Control = Avalonia.Controls.Control; // inside the namespace so it wins over the Sdz.Agent.Control namespace

/// <summary>
/// Panel with the same chrome as sdz-nfe-agent: brand header, status card, environment
/// card, credentials form, activity log console and a status bar. Built in code with the
/// tokens in <see cref="Theme"/> to keep the tray small (no XAML views).
/// </summary>
public sealed class MainWindow : Window
{
    private readonly App _app;
    private string? _lastLogs;

    // header / status
    private readonly TextBlock _version = new() { FontSize = 12, FontFamily = Seedz.Mono, Foreground = Seedz.FgLow, VerticalAlignment = VerticalAlignment.Center };
    private readonly Border _dot = Seedz.StatusDot();
    private readonly TextBlock _statusTitle = new() { FontSize = 20, FontWeight = FontWeight.Medium, Foreground = Seedz.FgHigh, VerticalAlignment = VerticalAlignment.Center };
    private readonly Border _modeTag = Seedz.Tag("Serviço", Seedz.InfoBg, Seedz.InfoFg);
    private readonly TextBlock _statusDetail = new() { FontSize = 14, Foreground = Seedz.FgMedium, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 6, 0, 0) };
    private readonly Button _run = Seedz.Button("Executar agora", "primary");

    // environment
    private readonly TextBlock _metaClient = new() { FontFamily = Seedz.Mono, FontSize = 12 };
    private readonly TextBlock _metaApi = new() { FontFamily = Seedz.Mono, FontSize = 12 };
    private readonly TextBlock _metaSchedules = new();
    private readonly TextBlock _metaLast = new();
    private readonly TextBlock _metaNext = new();
    private readonly TextBlock _metaData = new() { FontFamily = Seedz.Mono, FontSize = 12 };

    // credentials
    private readonly TextBox _clientId = new() { Watermark = "ex.: 1a2b3c4d5e6f7g8..." };
    private readonly TextBox _secret = new() { Watermark = "Client Secret", PasswordChar = '•' };
    private readonly ToggleButton _reveal = new() { Content = "👁", Width = 40, Height = 40, Margin = new Thickness(8, 0, 0, 0) };
    private readonly TextBox _apiUrl = new() { Watermark = "https://api.integration.seedz.ag/integration/v1/" };
    private readonly TextBlock _feedback = Seedz.Hint();
    private readonly Button _save = Seedz.Button("Salvar", "primary");

    // log
    private readonly TextBlock _logTitle = Seedz.Title("Log de atividade");
    private readonly Button _refreshLogs = Seedz.Button("Atualizar", "ghost", small: true);
    private readonly Button _clearLogs = Seedz.Button("Limpar logs", "outline", small: true);
    private readonly Button _openLogs = Seedz.Button("Abrir pasta", "outline", small: true);
    private readonly Button _exportLogs = Seedz.Button("Exportar", "outline", small: true);
    private readonly SelectableTextBlock _logs = new() { FontFamily = Seedz.Mono, FontSize = 12, LineHeight = 19, TextWrapping = TextWrapping.NoWrap, Foreground = Seedz.FgMedium };
    private readonly ScrollViewer _logsScroll = new() { Height = 220, HorizontalScrollBarVisibility = ScrollBarVisibility.Auto, VerticalScrollBarVisibility = ScrollBarVisibility.Auto };

    // status bar
    private readonly ToggleSwitch _autostart = new() { OnContent = "Iniciar com o sistema", OffContent = "Iniciar com o sistema", IsChecked = AutoStart.IsEnabled() };
    private readonly TextBlock _footer = new() { FontSize = 12, Foreground = Seedz.FgLow, VerticalAlignment = VerticalAlignment.Center };

    public MainWindow(App app)
    {
        _app = app;
        Title = "SDZ Agent";
        Width = 720;
        Height = 800;
        MinWidth = 480;
        MinHeight = 420;
        WindowStartupLocation = WindowStartupLocation.CenterScreen;
        CanResize = true;
        SizeToContent = SizeToContent.Manual;
        Background = Seedz.BgBase;
        try { Icon = new WindowIcon(AssetLoader.Open(new Uri("avares://sdz-agent-tray/Assets/app-icon.png"))); } catch { }

        _clientId.Classes.Add("mono");
        _apiUrl.Classes.Add("mono");
        _reveal.Classes.Add("ghost");
        _reveal.IsCheckedChanged += (_, _) => _secret.RevealPassword = _reveal.IsChecked == true;

        var body = new StackPanel
        {
            Spacing = 16,
            Margin = new Thickness(16),
            Children = { Header(), StatusCard(), EnvironmentCard(), CredentialsCard(), LogCard(), StatusBar() },
        };
        Content = new ScrollViewer { Content = body, HorizontalScrollBarVisibility = ScrollBarVisibility.Disabled };

        _save.Click += async (_, _) => await SaveAsync();
        _run.Click += async (_, _) => Feedback(await _app.RunNowAsync());
        _refreshLogs.Click += async (_, _) => await LoadLogsAsync();
        _clearLogs.Click += async (_, _) => { Feedback(await _app.ClearLogsAsync()); await LoadLogsAsync(); };
        _openLogs.Click += (_, _) => _app.OpenDataDir();
        _exportLogs.Click += async (_, _) => await ExportLogsAsync();
        _autostart.IsCheckedChanged += (_, _) => { AutoStart.Set(_autostart.IsChecked == true); _autostart.IsChecked = AutoStart.IsEnabled(); };
        _app.StatusChanged += OnStatusChanged;
        // the activity log refreshes itself every 5 s while the panel is open
        var logTimer = new Avalonia.Threading.DispatcherTimer { Interval = TimeSpan.FromSeconds(5) };
        logTimer.Tick += async (_, _) => { if (IsVisible) await LoadLogsAsync(); };
        logTimer.Start();
        Closed += (_, _) => { _app.StatusChanged -= OnStatusChanged; logTimer.Stop(); };

        OnStatusChanged();
        _ = LoadLogsAsync();
    }

    // ---------------------------------------------------------------- blocks

    /// <summary>.a-header: logo | product | version.</summary>
    private Control Header()
    {
        Control logo;
        try
        {
            logo = new Image { Source = new Bitmap(AssetLoader.Open(new Uri("avares://sdz-agent-tray/Assets/logo.png"))), Height = 22, Stretch = Stretch.Uniform, VerticalAlignment = VerticalAlignment.Center };
        }
        catch
        {
            logo = new TextBlock { Text = "seedz", FontSize = 16, FontWeight = FontWeight.Bold, Foreground = Seedz.FgHigh, VerticalAlignment = VerticalAlignment.Center };
        }
        var product = new Border
        {
            BorderBrush = Seedz.BorderLow, BorderThickness = new Thickness(1, 0, 0, 0), Padding = new Thickness(12, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock { Text = "Agent", FontSize = 12, FontWeight = FontWeight.Medium, Foreground = Seedz.FgMedium, VerticalAlignment = VerticalAlignment.Center },
        };
        var brand = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { logo, product, _version } };
        var card = Seedz.Card(brand, padding: 0, radius: 8);
        card.Padding = new Thickness(16, 12);
        return card;
    }

    /// <summary>.a-status-card: dot + title + tag + detail, primary action on the right.</summary>
    private Control StatusCard()
    {
        var title = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { _statusTitle, _modeTag } };
        var text = new StackPanel { Children = { title, _statusDetail } };
        var main = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 12, Children = { _dot, text } };
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(main, 0); grid.Children.Add(main);
        Grid.SetColumn(_run, 1); _run.VerticalAlignment = VerticalAlignment.Center; _run.Margin = new Thickness(24, 0, 0, 0); grid.Children.Add(_run);
        return Seedz.Card(grid);
    }

    /// <summary>.a-card "Ambiente" with the .a-meta-grid.</summary>
    private Control EnvironmentCard()
    {
        // 3 columns, rows sized to their own content (.a-meta-grid)
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,*,*"), RowDefinitions = new RowDefinitions("Auto,Auto"), Margin = new Thickness(0, 16, 0, 0) };
        var items = new[]
        {
            Seedz.MetaItem("Client ID", _metaClient), Seedz.MetaItem("API URL", _metaApi), Seedz.MetaItem("Agendamentos", _metaSchedules),
            Seedz.MetaItem("Última extração", _metaLast), Seedz.MetaItem("Próxima extração", _metaNext), Seedz.MetaItem("Pasta de dados", _metaData),
        };
        for (var i = 0; i < items.Length; i++)
        {
            items[i].Margin = new Thickness(0, 0, 24, 16);
            Grid.SetRow(items[i], i / 3); Grid.SetColumn(items[i], i % 3);
            grid.Children.Add(items[i]);
        }
        return Seedz.Card(new StackPanel { Children = { Seedz.Title("Ambiente"), grid } });
    }

    /// <summary>Setup form (.a-field + .a-input), primary button aligned right.</summary>
    private Control CredentialsCard()
    {
        var secretRow = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(_secret, 0); secretRow.Children.Add(_secret);
        Grid.SetColumn(_reveal, 1); secretRow.Children.Add(_reveal);

        var fields = new StackPanel
        {
            Spacing = 16,
            Margin = new Thickness(0, 16, 0, 0),
            Children =
            {
                Field("Client ID", _clientId),
                Field("Client secret", secretRow),
                Field("API URL", _apiUrl),
                _feedback,
                new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Spacing = 8, Children = { _save } },
            },
        };
        return Seedz.Card(new StackPanel { Children = { Seedz.Title("Credenciais"), fields } });
    }

    private static StackPanel Field(string label, Control input) => new() { Spacing = 6, Children = { Seedz.Label(label), input } };

    /// <summary>.a-card--flush .a-log: head with toolbar, console body.</summary>
    private Control LogCard()
    {
        var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8, HorizontalAlignment = HorizontalAlignment.Right, Children = { _refreshLogs, _exportLogs, _clearLogs, _openLogs } };
        var head = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(_logTitle, 0); head.Children.Add(_logTitle);
        Grid.SetColumn(toolbar, 1); head.Children.Add(toolbar);
        var headBorder = new Border { BorderBrush = Seedz.BorderLow, BorderThickness = new Thickness(0, 0, 0, 1), Padding = new Thickness(16, 12), Child = head };

        _logsScroll.Content = new Border { Background = Seedz.ConsoleBg, Padding = new Thickness(8), Child = _logs };
        var console = new Border
        {
            Background = Seedz.ConsoleBg, BorderBrush = Seedz.BorderLow, BorderThickness = new Thickness(1), CornerRadius = new CornerRadius(8),
            Margin = new Thickness(16), Child = _logsScroll, ClipToBounds = true,
        };
        var card = Seedz.Card(new StackPanel { Children = { headBorder, console } }, padding: 0);
        card.ClipToBounds = true;
        return card;
    }

    /// <summary>.a-statusbar</summary>
    private Control StatusBar()
    {
        var grid = new Grid { ColumnDefinitions = new ColumnDefinitions("*,Auto") };
        Grid.SetColumn(_autostart, 0); grid.Children.Add(_autostart);
        Grid.SetColumn(_footer, 1); grid.Children.Add(_footer);
        var bar = Seedz.Card(grid, padding: 0, radius: 8);
        bar.Padding = new Thickness(16, 8);
        return bar;
    }

    // ---------------------------------------------------------------- state

    private void OnStatusChanged()
    {
        Avalonia.Threading.Dispatcher.UIThread.Post(() =>
        {
            var s = _app.Status;
            _footer.Text = s is null ? "" : $"serviço no ar desde {s.StartedAt:dd/MM HH:mm}";
            _version.Text = s is null ? "" : s.Version;
            if (s is null)
            {
                Seedz.SetStatus(_dot, "off");
                _statusTitle.Text = "Serviço parado";
                _statusDetail.Text = "O serviço SDZ Agent não está respondendo. "
                    + (OperatingSystem.IsWindows() ? "Inicie o serviço SDZ-AGENT em services.msc ou, como administrador: sc start SDZ-AGENT. " : "Inicie com: sudo systemctl start sdz-agent. ")
                    + "As credenciais são salvas pelo serviço, por isso o botão Salvar fica desabilitado enquanto ele estiver parado."
                    + (string.IsNullOrWhiteSpace(_app.ConnectionError) ? "" : $"\n({_app.ConnectionError})");
                _modeTag.IsVisible = false;
                _save.IsEnabled = false;
                _run.IsEnabled = false;
                SetMeta(null);
                return;
            }
            _modeTag.IsVisible = true;
            _save.IsEnabled = true;
            _run.IsEnabled = s.Configured && !s.Running;
            if (string.IsNullOrEmpty(_apiUrl.Text) && !string.IsNullOrEmpty(s.ApiUrl)) _apiUrl.Text = s.ApiUrl;
            if (string.IsNullOrEmpty(_clientId.Text) && !string.IsNullOrEmpty(s.ClientId)) _clientId.Text = s.ClientId;
            if (string.IsNullOrEmpty(_secret.Text) && !string.IsNullOrEmpty(s.ClientSecret)) _secret.Text = s.ClientSecret;
            SetMeta(s);

            if (!s.Configured)
            {
                Seedz.SetStatus(_dot, "pending");
                _statusTitle.Text = "Credenciais não configuradas";
                _statusDetail.Text = "Informe o Client ID e o Client Secret fornecidos pela Seedz.";
                return;
            }
            var ok = s.AuthOk && string.IsNullOrEmpty(s.LastError);
            if (s.Running)
            {
                Seedz.SetStatus(_dot, "on");
                _statusTitle.Text = "Extração em andamento";
                _statusDetail.Text = "O agente está extraindo e enviando os dados para a Seedz.";
            }
            else if (ok)
            {
                Seedz.SetStatus(_dot, "on");
                _statusTitle.Text = "Agente em execução";
                _statusDetail.Text = s.NextRunAt is { } n ? $"Próxima extração em {n:dd/MM HH:mm}." : "Aguardando o agendamento da setting.";
            }
            else
            {
                Seedz.SetStatus(_dot, "off");
                _statusTitle.Text = "Agente com problemas";
                _statusDetail.Text = string.IsNullOrEmpty(s.LastError) ? "Falha de autenticação na API." : s.LastError;
            }
        });
    }

    private void SetMeta(AgentStatus? s)
    {
        _metaClient.Text = s?.ClientId is { Length: > 0 } c ? c : "—";
        _metaApi.Text = s?.ApiUrl is { Length: > 0 } a ? a : "—";
        _metaSchedules.Text = s is { Schedules.Count: > 0 } ? string.Join(" | ", s.Schedules) : "—";
        _metaLast.Text = s?.LastExecutionAt is { } l ? $"{l:dd/MM HH:mm:ss} ({(s.LastExecutionOk == true ? "ok" : "falhou")})" : "—";
        _metaLast.Foreground = s?.LastExecutionOk == false ? Seedz.NegativeFg : Seedz.FgHigh;
        _metaNext.Text = s?.NextRunAt is { } n ? n.ToString("dd/MM HH:mm") : "—";
        _metaData.Text = s?.DataDir is { Length: > 0 } d ? d : "—";
    }

    private void Feedback(ControlResponse r)
    {
        _feedback.Text = (r.Ok ? "✔ " : "✖ ") + r.Message;
        _feedback.Foreground = r.Ok ? Seedz.PositiveFg : Seedz.NegativeFg;
    }

    /// <summary>Asks the service for every log line and saves it where the user picks (default: Documents).</summary>
    public async Task ExportLogsAsync()
    {
        var target = await StorageProvider.SaveFilePickerAsync(new Avalonia.Platform.Storage.FilePickerSaveOptions
        {
            Title = "Exportar logs do SDZ Agent",
            SuggestedFileName = $"sdz-agent-logs-{DateTime.Now:yyyyMMdd-HHmmss}.txt",
            DefaultExtension = "txt",
            ShowOverwritePrompt = true,
            SuggestedStartLocation = await StorageProvider.TryGetWellKnownFolderAsync(Avalonia.Platform.Storage.WellKnownFolder.Documents),
            FileTypeChoices = new[] { new Avalonia.Platform.Storage.FilePickerFileType("Texto") { Patterns = new[] { "*.txt", "*.log" } } },
        });
        if (target is null) return;

        _feedback.Text = "Exportando logs…";
        _feedback.Foreground = Seedz.FgMedium;
        var r = await _app.ExportLogsAsync();
        if (!r.Ok) { Feedback(r); return; }
        var lines = r.Logs ?? new List<string>();
        try
        {
            await using var stream = await target.OpenWriteAsync();
            var s = _app.Status;
            await Sdz.Agent.Tray.LogFile.WriteAsync(stream, lines, s is null ? null : $"versão {s.Version} · client {s.ClientId} · dados em {s.DataDir}");
            _feedback.Text = $"✔ {lines.Count} linhas exportadas para {target.Name}";
            _feedback.Foreground = Seedz.PositiveFg;
        }
        catch (Exception e)
        {
            _feedback.Text = "✖ Não foi possível gravar o arquivo: " + e.Message;
            _feedback.Foreground = Seedz.NegativeFg;
        }
    }

    private async Task SaveAsync()
    {
        _save.IsEnabled = false;
        _feedback.Text = "Validando credenciais na API…";
        _feedback.Foreground = Seedz.FgMedium;
        var r = await _app.ConfigureAsync(_clientId.Text?.Trim() ?? "", _secret.Text?.Trim() ?? "", _apiUrl.Text?.Trim());
        _feedback.Text = r.Ok ? "✔ Credenciais salvas. O serviço já está usando a nova configuração." : "✖ " + r.Message;
        _feedback.Foreground = r.Ok ? Seedz.PositiveFg : Seedz.NegativeFg;
        _save.IsEnabled = true;
    }

    /// <summary>Lines come as "date time level message": timestamp in fg-low, message coloured by level (.a-log__line--*).</summary>
    private async Task LoadLogsAsync()
    {
        var lines = await _app.LogsAsync(200);
        var joined = string.Join("\n", lines);
        if (joined == _lastLogs && _logs.Inlines is { Count: > 0 }) return; // nothing new: no re-render, no scroll jump
        _lastLogs = joined;
        // keep following the tail only when the reader is already at the bottom
        var atBottom = _logsScroll.Offset.Y >= _logsScroll.Extent.Height - _logsScroll.Viewport.Height - 24;
        _logTitle.Text = $"Log de atividade ({lines.Count} eventos)";
        _logs.Inlines ??= new InlineCollection();
        _logs.Inlines.Clear();
        if (lines.Count == 0)
        {
            _logs.Inlines.Add(new Run("Nenhum evento ainda.") { Foreground = Seedz.FgLow });
            return;
        }
        foreach (var line in lines)
        {
            var parts = line.Split(' ', 4, StringSplitOptions.RemoveEmptyEntries);
            if (parts.Length >= 4)
            {
                var level = parts[2].ToLowerInvariant();
                var message = parts[3];
                var upper = message.ToUpperInvariant();
                var brush = level switch
                {
                    "error" => Seedz.NegativeFg,
                    "warn" => Seedz.WarnFg,
                    _ when upper.Contains("DONE") || upper.Contains("SUCCESS") || upper.Contains("SAVED") || upper.Contains("HEALTHY") => Seedz.PositiveFg,
                    "info" => Seedz.InfoFg,
                    _ => Seedz.FgMedium,
                };
                _logs.Inlines.Add(new Run($"{parts[0]} {parts[1]}  ") { Foreground = Seedz.FgLow });
                _logs.Inlines.Add(new Run(message) { Foreground = brush });
            }
            else
            {
                _logs.Inlines.Add(new Run(line) { Foreground = Seedz.FgMedium });
            }
            _logs.Inlines.Add(new LineBreak());
        }
        if (atBottom) _logsScroll.ScrollToEnd();
    }
}
