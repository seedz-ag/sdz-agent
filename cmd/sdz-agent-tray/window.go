package main

import (
	"fmt"
	"image/color"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/layout"
	"fyne.io/fyne/v2/theme"
	"fyne.io/fyne/v2/widget"

	"github.com/seedz-ag/sdz-agent-go/internal/state"
)

// panel is the window content: the same chrome as sdz-nfe-agent (brand header, status card,
// environment card, credentials form, activity log console, status bar) drawn with the
// Seedz tokens in theme.go.
type panel struct {
	a *app

	version      *canvas.Text
	dot          *statusDot
	statusTitle  *canvas.Text
	modeTag      fyne.CanvasObject
	statusDetail *widget.Label
	runBtn       *widget.Button

	metaClient, metaAPI, metaSchedules, metaLast, metaNext, metaData *metaItem

	clientID, secret, apiURL *widget.Entry
	feedback                 *canvas.Text
	saveBtn                  *widget.Button

	logTitle   *canvas.Text
	logs       *widget.RichText
	logsScroll *container.Scroll

	autostart *widget.Check

	lastLogs     string
	lastLogCount int
	footer       *canvas.Text
}

func (a *app) buildWindow() {
	w := a.fyne.NewWindow("SDZ Agent")
	w.Resize(fyne.NewSize(620, 640))
	w.SetCloseIntercept(func() { a.visible.Store(false); w.Hide() }) // closing the panel keeps the tray alive
	a.window = w

	p := &panel{a: a}
	a.panel = p

	// header
	p.version = text("", 12, cFgLow, fyne.TextStyle{Monospace: true})
	logo := canvas.NewImageFromResource(fyne.NewStaticResource("logo.png", asset("assets/logo.png")))
	logo.FillMode = canvas.ImageFillContain
	logo.SetMinSize(fyne.NewSize(81, 18))
	product := text("Agent", 12, cFgMedium, fyne.TextStyle{Bold: true})
	vsep := canvas.NewRectangle(cBorderLow)
	vsep.SetMinSize(fyne.NewSize(1, 18))
	header := cardPadded(container.NewHBox(logo, vsep, product, p.version), 6, 8)

	// status card
	p.dot = newStatusDot()
	p.statusTitle = text("Conectando ao serviço…", 16, cFgHigh, fyne.TextStyle{Bold: true})
	p.modeTag = tag("Serviço", cInfoBg, cInfoFg)
	p.statusDetail = widget.NewLabel("")
	p.statusDetail.Wrapping = fyne.TextWrapWord
	p.runBtn = widget.NewButtonWithIcon("Executar agora", theme.MediaPlayIcon(), func() { go a.runNow() })
	p.runBtn.Importance = widget.HighImportance
	titleRow := container.NewHBox(p.statusTitle, p.modeTag)
	// Border (not HBox) so the detail text takes the remaining width instead of wrapping to its min size
	statusMain := container.NewBorder(nil, nil, container.NewVBox(p.dot.box), nil, container.NewVBox(titleRow, p.statusDetail))
	status := cardPadded(container.NewBorder(nil, nil, nil, container.NewCenter(p.runBtn), statusMain), 12, 10)

	// environment card
	p.metaClient = newMetaItem("Client ID", true)
	p.metaAPI = newMetaItem("API URL", true)
	p.metaSchedules = newMetaItem("Agendamentos", false)
	p.metaLast = newMetaItem("Última extração", false)
	p.metaNext = newMetaItem("Próxima extração", false)
	p.metaData = newMetaItem("Pasta de dados", true)
	grid := container.NewGridWithColumns(3, p.metaClient.box, p.metaAPI.box, p.metaSchedules.box, p.metaLast.box, p.metaNext.box, p.metaData.box)
	env := cardPadded(container.NewVBox(title("Ambiente"), grid), 12, 10)

	// credentials card
	p.clientID = widget.NewEntry()
	p.clientID.SetPlaceHolder("ex.: 1a2b3c4d5e6f7g8...")
	p.clientID.TextStyle = fyne.TextStyle{Monospace: true}
	p.secret = widget.NewPasswordEntry() // the eye icon reveals the secret
	p.secret.SetPlaceHolder("Client Secret")
	p.apiURL = widget.NewEntry()
	p.apiURL.SetPlaceHolder(defaultAPIURL)
	p.apiURL.TextStyle = fyne.TextStyle{Monospace: true}
	p.feedback = text("", 12, cFgMedium, fyne.TextStyle{})
	p.saveBtn = widget.NewButton("Salvar", func() { go a.save() })
	p.saveBtn.Importance = widget.HighImportance
	// label beside the input (one row per field) instead of above it
	fields := container.New(layout.NewFormLayout(),
		label("Client ID"), p.clientID,
		label("Client secret"), p.secret,
		label("API URL"), p.apiURL,
	)
	form := container.NewVBox(
		title("Credenciais"),
		fields,
		container.NewBorder(nil, nil, nil, p.saveBtn, container.NewCenter(p.feedback)),
	)
	credentials := cardPadded(form, 12, 10)

	// log card (flush: head with toolbar, console body)
	p.logTitle = title("Log de atividade")
	refresh := widget.NewButtonWithIcon("Atualizar", theme.ViewRefreshIcon(), func() { go a.loadLogs() })
	refresh.Importance = widget.LowImportance
	clear := widget.NewButtonWithIcon("Limpar logs", theme.DeleteIcon(), func() { go a.clearLogs() })
	folder := widget.NewButtonWithIcon("Abrir pasta", theme.FolderOpenIcon(), a.openLogs)
	export := widget.NewButtonWithIcon("Exportar", theme.DocumentSaveIcon(), a.exportLogs)
	head := container.New(layout.NewCustomPaddedLayout(6, 6, 12, 12),
		container.NewBorder(nil, nil, container.NewCenter(p.logTitle), container.NewHBox(refresh, export, clear, folder)))
	p.logs = widget.NewRichText()
	p.logs.Wrapping = fyne.TextWrapOff
	p.logsScroll = container.NewScroll(p.logs)
	p.logsScroll.SetMinSize(fyne.NewSize(0, 170))
	body := container.New(layout.NewCustomPaddedLayout(0, 10, 10, 10), console(p.logsScroll))
	logCard := cardPadded(container.NewVBox(head, hline(), body), 0, 10)

	// status bar
	p.autostart = widget.NewCheck("Iniciar com o sistema", func(on bool) {
		_ = autostartSet(on)
		a.autostartItem.Checked = autostartEnabled()
		a.menu.Refresh()
	})
	p.autostart.SetChecked(autostartEnabled())
	p.footer = text("", 12, cFgLow, fyne.TextStyle{})
	statusbar := cardPadded(container.NewBorder(nil, nil, p.autostart, container.NewCenter(p.footer)), 2, 8)

	page := container.NewVBox(header, status, env, credentials, logCard, statusbar)
	w.SetContent(container.NewVScroll(container.New(layout.NewCustomPaddedLayout(8, 8, 10, 10), page)))
}

func field(name string, input fyne.CanvasObject) fyne.CanvasObject {
	return container.NewVBox(label(name), input)
}

func layoutGap(h float32) fyne.CanvasObject {
	s := canvas.NewRectangle(color.Transparent)
	s.SetMinSize(fyne.NewSize(1, h))
	return s
}

// render applies the service snapshot to the panel (must run on the Fyne goroutine).
func (p *panel) render(s *state.Status, connErr string) {
	if s == nil {
		p.version.Text = ""
		p.footer.Text = ""
		p.dot.set("off")
		p.statusTitle.Text = "Serviço parado"
		p.statusDetail.SetText(serviceDownHint(connErr))
		p.modeTag.Hide()
		p.saveBtn.Disable()
		p.runBtn.Disable()
		p.setMeta(nil)
		p.refreshTexts()
		return
	}
	p.version.Text = s.Version
	p.footer.Text = "serviço no ar desde " + s.StartedAt.Format("02/01 15:04")
	p.modeTag.Show()
	p.saveBtn.Enable()
	if s.Configured && !s.Running {
		p.runBtn.Enable()
	} else {
		p.runBtn.Disable()
	}
	if p.apiURL.Text == "" && s.APIURL != "" {
		p.apiURL.SetText(s.APIURL)
	}
	if p.clientID.Text == "" && s.ClientID != "" {
		p.clientID.SetText(s.ClientID)
	}
	if p.secret.Text == "" && s.ClientSecret != "" {
		p.secret.SetText(s.ClientSecret)
	}
	p.setMeta(s)

	switch {
	case !s.Configured:
		p.dot.set("pending")
		p.statusTitle.Text = "Credenciais não configuradas"
		p.statusDetail.SetText("Informe o Client ID e o Client Secret fornecidos pela Seedz.")
	case s.Running:
		p.dot.set("on")
		p.statusTitle.Text = "Extração em andamento"
		p.statusDetail.SetText("O agente está extraindo e enviando os dados para a Seedz.")
	case s.AuthOK && s.LastError == "":
		p.dot.set("on")
		p.statusTitle.Text = "Agente em execução"
		if s.NextRunAt != nil {
			p.statusDetail.SetText("Próxima extração em " + s.NextRunAt.Format("02/01 15:04") + ".")
		} else {
			p.statusDetail.SetText("Aguardando o agendamento da setting.")
		}
	default:
		p.dot.set("off")
		p.statusTitle.Text = "Agente com problemas"
		p.statusDetail.SetText(firstNonBlank(s.LastError, "Falha de autenticação na API."))
	}
	p.refreshTexts()
}

func (p *panel) refreshTexts() {
	p.version.Refresh()
	p.footer.Refresh()
	p.statusTitle.Refresh()
}

func (p *panel) setMeta(s *state.Status) {
	if s == nil {
		for _, m := range []*metaItem{p.metaClient, p.metaAPI, p.metaSchedules, p.metaLast, p.metaNext, p.metaData} {
			m.set("", cFgHigh)
		}
		return
	}
	p.metaClient.set(s.ClientID, cFgHigh)
	p.metaAPI.set(s.APIURL, cFgHigh)
	p.metaSchedules.set(strings.Join(s.Schedules, " | "), cFgHigh)
	last, lastColor := "", cFgHigh
	if s.LastExecutionAt != nil {
		res := "falhou"
		lastColor = cNegativeFg
		if s.LastExecutionOK != nil && *s.LastExecutionOK {
			res, lastColor = "ok", cFgHigh
		}
		last = fmt.Sprintf("%s (%s)", s.LastExecutionAt.Format("02/01 15:04:05"), res)
	}
	p.metaLast.set(last, lastColor)
	next := ""
	if s.NextRunAt != nil {
		next = s.NextRunAt.Format("02/01 15:04")
	}
	p.metaNext.set(next, cFgHigh)
	p.metaData.set(s.DataDir, cFgHigh)
}

func (p *panel) setFeedback(ok bool, msg string) {
	if ok {
		p.feedback.Text, p.feedback.Color = "✔ "+msg, cPrimary
	} else {
		p.feedback.Text, p.feedback.Color = "✖ "+msg, cNegativeFg
	}
	p.feedback.Refresh()
}

// setLogs renders "date time level message" lines: timestamp in fg-low, message coloured by level.
func (p *panel) setLogs(lines []string) {
	if joined := strings.Join(lines, "\n"); joined == p.lastLogs && p.lastLogCount > 0 {
		return // nothing new: skip the re-render (no flicker on auto-refresh)
	} else {
		p.lastLogs = joined
	}
	p.logTitle.Text = fmt.Sprintf("Log de atividade (%d eventos)", len(lines))
	p.logTitle.Refresh()
	segments := make([]widget.RichTextSegment, 0, len(lines)*2)
	mono := fyne.TextStyle{Monospace: true}
	if len(lines) == 0 {
		segments = append(segments, &widget.TextSegment{Text: "Nenhum evento ainda.", Style: widget.RichTextStyle{ColorName: theme.ColorNamePlaceHolder, TextStyle: mono}})
	}
	for _, line := range lines {
		parts := strings.SplitN(line, " ", 4)
		if len(parts) < 4 {
			segments = append(segments, &widget.TextSegment{Text: line, Style: widget.RichTextStyle{Inline: false, TextStyle: mono}})
			continue
		}
		level := strings.ToLower(parts[2])
		msg := parts[3]
		upper := strings.ToUpper(msg)
		colorName := theme.ColorNameForeground
		switch {
		case level == "error":
			colorName = theme.ColorNameError
		case level == "warn":
			colorName = theme.ColorNameWarning
		case strings.Contains(upper, "DONE") || strings.Contains(upper, "SUCCESS") || strings.Contains(upper, "SAVED") || strings.Contains(upper, "HEALTHY"):
			colorName = theme.ColorNameSuccess
		case level == "info":
			colorName = theme.ColorNameHyperlink
		}
		segments = append(segments,
			&widget.TextSegment{Text: parts[0] + " " + parts[1] + "  ", Style: widget.RichTextStyle{Inline: true, ColorName: theme.ColorNamePlaceHolder, TextStyle: mono}},
			&widget.TextSegment{Text: msg, Style: widget.RichTextStyle{Inline: false, ColorName: colorName, TextStyle: mono}},
		)
	}
	// keep following the tail only when the reader is already at the bottom
	atBottom := p.logsScroll.Offset.Y >= p.logs.MinSize().Height-p.logsScroll.Size().Height-24
	p.logs.Segments = segments
	p.logs.Refresh()
	if atBottom || p.lastLogCount == 0 {
		p.logsScroll.ScrollToBottom()
	}
	p.lastLogCount = len(lines)
}

func firstNonBlank(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// serviceDownHint explains what to do when the control channel cannot be reached.
func serviceDownHint(connErr string) string {
	hint := "O serviço SDZ Agent não está respondendo."
	if isWindows {
		hint += " Inicie o serviço SDZ-AGENT em services.msc ou, como administrador: sc start SDZ-AGENT."
	} else {
		hint += " Inicie com: sudo systemctl start sdz-agent."
	}
	hint += " As credenciais são salvas pelo serviço, por isso o botão Salvar fica desabilitado enquanto ele estiver parado."
	if strings.TrimSpace(connErr) != "" {
		hint += "\n(" + connErr + ")"
	}
	return hint
}
