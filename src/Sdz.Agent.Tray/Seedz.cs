using Avalonia;
using Avalonia.Controls;
using Avalonia.Controls.Shapes;
using Avalonia.Layout;
using Avalonia.Media;

namespace Sdz.Agent.Tray;

using Control = Avalonia.Controls.Control; // inside the namespace so it wins over the Sdz.Agent.Control namespace

/// <summary>
/// Seedz design system tokens (copied from sdz-nfe-agent's style.css, dark theme) and the
/// small set of "components" the panel is built from: card, eyebrow/label text, status dot, tag.
/// </summary>
public static class Seedz
{
    // surfaces / text
    public static readonly IBrush BgBase = Brush("#040B1E");
    public static readonly IBrush BgMedium = Brush("#081431");
    public static readonly IBrush BgHigh = Brush("#0D1D42");
    public static readonly IBrush ConsoleBg = Brush("#02070F");
    public static readonly IBrush FgHigh = Brush("#FFFFFF");
    public static readonly IBrush FgMedium = Brush("#9FADCB");
    public static readonly IBrush FgLow = Brush("#6B7BA6");
    public static readonly IBrush BorderLow = Brush("#16244B");
    public static readonly IBrush BorderMedium = Brush("#22335F");
    // brand / semantic
    public static readonly IBrush Primary = Brush("#34D579");
    public static readonly IBrush PositiveFg = Brush("#34D579");
    public static readonly IBrush NegativeFg = Brush("#FF6B57");
    public static readonly IBrush InfoFg = Brush("#6E9BFF");
    public static readonly IBrush WarnFg = Brush("#FFB020");
    public static readonly IBrush PositiveBg = Brush("#1F34D579");
    public static readonly IBrush NegativeBg = Brush("#24FF6B57");
    public static readonly IBrush InfoBg = Brush("#246E9BFF");
    public static readonly IBrush WarnBg = Brush("#24FFB020");
    public static readonly IBrush NeutralBg = Brush("#12FFFFFF");

    public static readonly FontFamily Mono = new("Cascadia Mono,Consolas,DejaVu Sans Mono,Liberation Mono,monospace");

    private static IBrush Brush(string hex) => new SolidColorBrush(Color.Parse(hex));

    /// <summary>.a-card: flat surface, border for containment, 12px radius.</summary>
    public static Border Card(Control body, double padding = 24, double radius = 12) => new()
    {
        Background = BgMedium,
        BorderBrush = BorderLow,
        BorderThickness = new Thickness(1),
        CornerRadius = new CornerRadius(radius),
        Padding = new Thickness(padding),
        Child = body,
    };

    /// <summary>.a-title</summary>
    public static TextBlock Title(string text) => new()
    {
        Text = text, FontSize = 16, FontWeight = FontWeight.Medium, Foreground = FgHigh, VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>.a-eyebrow / .a-meta-item__k: small uppercase mono key.</summary>
    public static TextBlock Eyebrow(string text) => new()
    {
        Text = text.ToUpperInvariant(), FontSize = 10, FontFamily = Mono, FontWeight = FontWeight.Medium, Foreground = FgLow, LetterSpacing = 1,
    };

    /// <summary>.a-label</summary>
    public static TextBlock Label(string text) => new() { Text = text, FontSize = 12, FontWeight = FontWeight.Medium, Foreground = FgHigh };

    /// <summary>.a-field__hint</summary>
    public static TextBlock Hint(string text = "") => new() { Text = text, FontSize = 12, Foreground = FgMedium, TextWrapping = TextWrapping.Wrap };

    /// <summary>.a-meta-item</summary>
    public static StackPanel MetaItem(string key, TextBlock value)
    {
        value.FontSize = 14;
        value.Foreground = FgHigh;
        value.TextWrapping = TextWrapping.Wrap;
        return new StackPanel { Spacing = 4, Margin = new Thickness(0, 0, 24, 0), Children = { Eyebrow(key), value } };
    }

    /// <summary>.a-status__dot with its halo; recoloured through <see cref="SetStatus"/>.</summary>
    public static Border StatusDot()
    {
        var dot = new Ellipse { Width = 10, Height = 10, Fill = FgLow };
        return new Border
        {
            Width = 18, Height = 18, CornerRadius = new CornerRadius(9), Background = NeutralBg,
            VerticalAlignment = VerticalAlignment.Top, Margin = new Thickness(0, 4, 0, 0), Child = dot,
        };
    }

    public static void SetStatus(Border dot, string state)
    {
        var (fill, halo) = state switch
        {
            "on" => (Primary, PositiveBg),
            "off" => (NegativeFg, NegativeBg),
            "pending" => (WarnFg, WarnBg),
            _ => (FgLow, NeutralBg),
        };
        ((Ellipse)dot.Child!).Fill = fill;
        dot.Background = halo;
    }

    /// <summary>.a-tag (pill).</summary>
    public static Border Tag(string text, IBrush bg, IBrush fg) => new()
    {
        Height = 24, CornerRadius = new CornerRadius(999), Background = bg, Padding = new Thickness(10, 0), VerticalAlignment = VerticalAlignment.Center,
        Child = new TextBlock { Text = text, FontSize = 12, FontWeight = FontWeight.Medium, Foreground = fg, VerticalAlignment = VerticalAlignment.Center },
    };

    public static Button Button(string text, string variant, bool small = false)
    {
        var b = new Button { Content = text };
        b.Classes.Add(variant);
        if (small) b.Classes.Add("sm");
        return b;
    }
}
