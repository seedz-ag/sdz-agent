package main

import (
	"image/color"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"
)

// Seedz design system tokens (copied from sdz-nfe-agent's style.css, dark theme).
var (
	cBgBase       = hex("#040B1E")
	cBgMedium     = hex("#081431")
	cBgHigh       = hex("#0D1D42")
	cConsoleBg    = hex("#02070F")
	cFgHigh       = hex("#FFFFFF")
	cFgMedium     = hex("#9FADCB")
	cFgLow        = hex("#6B7BA6")
	cBorderLow    = hex("#16244B")
	cBorderMedium = hex("#22335F")
	cBorderHigh   = hex("#3A4E80")
	cPrimary      = hex("#34D579")
	cPrimaryText  = hex("#001648")
	cNegative     = hex("#E11900")
	cNegativeFg   = hex("#FF6B57")
	cInfoFg       = hex("#6E9BFF")
	cWarnFg       = hex("#FFB020")
	cPositiveBg   = color.NRGBA{R: 0x34, G: 0xD5, B: 0x79, A: 0x1F}
	cNegativeBg   = color.NRGBA{R: 0xFF, G: 0x6B, B: 0x57, A: 0x24}
	cInfoBg       = color.NRGBA{R: 0x6E, G: 0x9B, B: 0xFF, A: 0x24}
	cWarnBg       = color.NRGBA{R: 0xFF, G: 0xB0, B: 0x20, A: 0x24}
	cNeutralBg    = color.NRGBA{R: 0xFF, G: 0xFF, B: 0xFF, A: 0x12}
)

func hex(s string) color.NRGBA {
	var r, g, b uint8
	for i, p := range []*uint8{&r, &g, &b} {
		*p = unhex(s[1+i*2])<<4 | unhex(s[2+i*2])
	}
	return color.NRGBA{R: r, G: g, B: b, A: 0xFF}
}

func unhex(c byte) uint8 {
	switch {
	case c >= '0' && c <= '9':
		return c - '0'
	case c >= 'a' && c <= 'f':
		return c - 'a' + 10
	case c >= 'A' && c <= 'F':
		return c - 'A' + 10
	}
	return 0
}

// seedzTheme maps the Fyne theme names onto the Seedz tokens (always dark, like the NFe agent).
type seedzTheme struct{ fyne.Theme }

func newSeedzTheme() fyne.Theme { return &seedzTheme{Theme: theme.DefaultTheme()} }

func (t *seedzTheme) Color(name fyne.ThemeColorName, _ fyne.ThemeVariant) color.Color {
	switch name {
	case theme.ColorNameBackground:
		return cBgBase
	case theme.ColorNameForeground:
		return cFgHigh
	case theme.ColorNameButton, theme.ColorNameDisabledButton:
		return cBgHigh
	case theme.ColorNameDisabled, theme.ColorNamePlaceHolder:
		return cFgLow
	case theme.ColorNameInputBackground:
		return cBgBase
	case theme.ColorNameInputBorder:
		return cBorderMedium
	case theme.ColorNameFocus:
		return cInfoFg
	case theme.ColorNameHover:
		return cBorderLow
	case theme.ColorNamePressed, theme.ColorNameSelection:
		return cBorderMedium
	case theme.ColorNameSeparator:
		return cBorderLow
	case theme.ColorNamePrimary, theme.ColorNameSuccess:
		return cPrimary
	case theme.ColorNameForegroundOnPrimary, theme.ColorNameForegroundOnSuccess, theme.ColorNameForegroundOnWarning:
		return cPrimaryText
	case theme.ColorNameError:
		return cNegativeFg
	case theme.ColorNameForegroundOnError:
		return cFgHigh
	case theme.ColorNameWarning:
		return cWarnFg
	case theme.ColorNameHyperlink:
		return cInfoFg
	case theme.ColorNameMenuBackground, theme.ColorNameOverlayBackground, theme.ColorNameHeaderBackground, theme.ColorNameScrollBarBackground:
		return cBgMedium
	case theme.ColorNameScrollBar:
		return cBorderHigh
	case theme.ColorNameShadow:
		return color.NRGBA{A: 0x80}
	}
	return t.Theme.Color(name, theme.VariantDark)
}

func (t *seedzTheme) Size(name fyne.ThemeSizeName) float32 {
	switch name {
	case theme.SizeNameInputRadius, theme.SizeNameButtonRadius, theme.SizeNameSelectionRadius:
		return 8
	case theme.SizeNameCardRadius, theme.SizeNameDialogRadius:
		return 12
	case theme.SizeNameText:
		return 13
	case theme.SizeNamePadding:
		return 3
	case theme.SizeNameInnerPadding:
		return 6
	case theme.SizeNameInputBorder:
		return 1
	}
	return t.Theme.Size(name)
}

// ---------------------------------------------------------------- components

// card is .a-card: flat surface, 1px border for containment, 12px radius, 24px padding.
func card(body fyne.CanvasObject) fyne.CanvasObject { return cardPadded(body, 24, 12) }

func cardPadded(body fyne.CanvasObject, pad, radius float32) fyne.CanvasObject {
	bg := canvas.NewRectangle(cBgMedium)
	bg.StrokeColor = cBorderLow
	bg.StrokeWidth = 1
	bg.CornerRadius = radius
	return container.NewStack(bg, container.New(layout.NewCustomPaddedLayout(pad, pad, pad, pad), body))
}

func text(s string, size float32, col color.Color, style fyne.TextStyle) *canvas.Text {
	t := canvas.NewText(s, col)
	t.TextSize = size
	t.TextStyle = style
	return t
}

// title is .a-title
func title(s string) *canvas.Text { return text(s, 14, cFgHigh, fyne.TextStyle{Bold: true}) }

// eyebrow is .a-meta-item__k: small uppercase mono key
func eyebrow(s string) *canvas.Text {
	return text(toUpper(s), 10, cFgLow, fyne.TextStyle{Monospace: true, Bold: true})
}

// label is .a-label
func label(s string) *canvas.Text { return text(s, 12, cFgHigh, fyne.TextStyle{Bold: true}) }

func toUpper(s string) string {
	b := []rune(s)
	for i, r := range b {
		switch {
		case r >= 'a' && r <= 'z':
			b[i] = r - 32
		case r == 'ú':
			b[i] = 'Ú'
		case r == 'ó':
			b[i] = 'Ó'
		case r == 'ã':
			b[i] = 'Ã'
		case r == 'ç':
			b[i] = 'Ç'
		case r == 'é':
			b[i] = 'É'
		}
	}
	return string(b)
}

// metaItem is .a-meta-item: key above value. The value truncates with "…" so a long path
// never widens the window (full text in the tooltip-less label is still selectable via copy).
type metaItem struct {
	value *widget.Label
	box   fyne.CanvasObject
}

func newMetaItem(key string, mono bool) *metaItem {
	v := widget.NewLabel("—")
	v.TextStyle = fyne.TextStyle{Monospace: mono}
	v.Truncation = fyne.TextTruncateEllipsis
	return &metaItem{value: v, box: container.NewVBox(eyebrow(key), v)}
}

func (m *metaItem) set(s string, col color.Color) {
	if s == "" {
		s = "—"
	}
	if col == cNegativeFg {
		m.value.Importance = widget.DangerImportance
	} else {
		m.value.Importance = widget.MediumImportance
	}
	m.value.SetText(s)
}

// statusDot is .a-status__dot with its halo.
type statusDot struct {
	dot, halo *canvas.Circle
	box       fyne.CanvasObject
}

func newStatusDot() *statusDot {
	halo := canvas.NewCircle(cNeutralBg)
	dot := canvas.NewCircle(cFgLow)
	inner := container.New(layout.NewCustomPaddedLayout(4, 4, 4, 4), dot)
	return &statusDot{dot: dot, halo: halo, box: container.NewGridWrap(fyne.NewSize(18, 18), container.NewStack(halo, inner))}
}

func (d *statusDot) set(state string) {
	switch state {
	case "on":
		d.dot.FillColor, d.halo.FillColor = cPrimary, cPositiveBg
	case "off":
		d.dot.FillColor, d.halo.FillColor = cNegativeFg, cNegativeBg
	case "pending":
		d.dot.FillColor, d.halo.FillColor = cWarnFg, cWarnBg
	default:
		d.dot.FillColor, d.halo.FillColor = cFgLow, cNeutralBg
	}
	d.dot.Refresh()
	d.halo.Refresh()
}

// tag is .a-tag (pill).
func tag(s string, bg, fg color.Color) fyne.CanvasObject {
	r := canvas.NewRectangle(bg)
	r.CornerRadius = 12
	t := text(s, 12, fg, fyne.TextStyle{Bold: true})
	return container.NewStack(r, container.New(layout.NewCustomPaddedLayout(5, 5, 10, 10), t))
}

// console is .a-log__console: dark surface with border, holding the scrolling log.
func console(body fyne.CanvasObject) fyne.CanvasObject {
	bg := canvas.NewRectangle(cConsoleBg)
	bg.StrokeColor = cBorderLow
	bg.StrokeWidth = 1
	bg.CornerRadius = 8
	return container.NewStack(bg, container.New(layout.NewCustomPaddedLayout(8, 8, 8, 8), body))
}

// hline is a 1px separator in border-low.
func hline() fyne.CanvasObject {
	r := canvas.NewRectangle(cBorderLow)
	r.SetMinSize(fyne.NewSize(1, 1))
	return r
}
