// sdz-agent-tray: native tray + panel for the SDZ Agent service (Fyne).
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/storage"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"fyne.io/fyne/v2"
	fyneapp "fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/driver/desktop"

	"github.com/seedz-ag/sdz-agent-go/internal/control"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
)

const defaultAPIURL = "https://api.integration.seedz.ag/integration/v1/"

type app struct {
	fyne   fyne.App
	desk   desktop.App
	client *control.Client
	window fyne.Window

	mu       sync.Mutex
	status   *state.Status
	connErr  string
	iconName string

	// tray
	menu          *fyne.Menu
	statusItem    *fyne.MenuItem
	runItem       *fyne.MenuItem
	autostartItem *fyne.MenuItem

	// window content (window.go)
	panel *panel
	// visible is true while the panel is open: the log auto-refresh only runs then
	visible atomic.Bool
}

func main() {
	show := flag.Bool("show", false, "abre o painel ao iniciar")
	flag.Parse()
	setupDiagnostics()

	if !acquireSingleInstance() {
		return // already running in this session
	}

	a := &app{client: &control.Client{Timeout: 15 * time.Second}}
	a.fyne = fyneapp.NewWithID("ag.seedz.sdz-agent-tray")
	a.fyne.SetIcon(fyne.NewStaticResource("app-icon.png", asset("assets/app-icon.png")))
	a.fyne.Settings().SetTheme(newSeedzTheme())
	desk, ok := a.fyne.(desktop.App)
	if !ok {
		fmt.Fprintln(os.Stderr, "bandeja do sistema não suportada neste ambiente")
		os.Exit(1)
	}
	a.desk = desk
	a.buildTray()
	a.buildWindow()

	go a.pollLoop()
	go a.logsLoop()
	if *show || !autostartEnabled() {
		// first run (not yet auto-starting) opens the panel so the user can enter the credentials
		a.showWindow()
	}
	a.fyne.Run()
}

// acquireSingleInstance binds a well-known loopback port chosen from the user name so a
// second tray in the same session exits immediately (no lock files to clean up).
func acquireSingleInstance() bool {
	port := 47000 + int(hashString(os.Getenv("USER")+os.Getenv("USERNAME"))%500)
	l, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return false
	}
	instanceLock = l
	return true
}

var instanceLock net.Listener

func hashString(s string) uint32 {
	var h uint32 = 2166136261
	for i := 0; i < len(s); i++ {
		h ^= uint32(s[i])
		h *= 16777619
	}
	return h
}

// ---------------------------------------------------------------- tray

func (a *app) buildTray() {
	a.statusItem = fyne.NewMenuItem("Conectando ao serviço…", nil)
	a.statusItem.Disabled = true
	open := fyne.NewMenuItem("Abrir painel…", a.showWindow)
	a.runItem = fyne.NewMenuItem("Executar extração agora", func() { go a.runNow() })
	logs := fyne.NewMenuItem("Abrir pasta de logs", a.openLogs)
	clear := fyne.NewMenuItem("Limpar logs", func() { go a.clearLogs() })
	export := fyne.NewMenuItem("Exportar logs…", func() { a.showWindow(); a.exportLogs() })
	a.autostartItem = fyne.NewMenuItem("Iniciar com o sistema", nil)
	a.autostartItem.Checked = autostartEnabled()
	a.autostartItem.Action = func() {
		_ = autostartSet(!autostartEnabled())
		a.autostartItem.Checked = autostartEnabled()
		a.menu.Refresh()
	}
	quit := fyne.NewMenuItem("Sair", func() { a.fyne.Quit() })
	quit.IsQuit = true

	a.menu = fyne.NewMenu("SDZ Agent", a.statusItem, fyne.NewMenuItemSeparator(), open, a.runItem, logs, export, clear, fyne.NewMenuItemSeparator(), a.autostartItem, quit)
	a.desk.SetSystemTrayMenu(a.menu)
	a.setIcon("off")
}

func (a *app) setIcon(name string) {
	if a.iconName == name {
		return
	}
	a.iconName = name
	ext := "png"
	if isWindows {
		ext = "ico"
	}
	a.desk.SetSystemTrayIcon(fyne.NewStaticResource("tray-"+name+"."+ext, trayIcon(name)))
}

// ---------------------------------------------------------------- window

func (a *app) showWindow() {
	a.visible.Store(true)
	fyne.Do(func() {
		a.window.Show()
		a.window.RequestFocus()
	})
	go a.loadLogs()
}

// ---------------------------------------------------------------- status

func (a *app) pollLoop() {
	a.refresh()
	t := time.NewTicker(10 * time.Second)
	for range t.C {
		a.refresh()
	}
}

// logsLoop refreshes the activity log every 5 s while the panel is open.
func (a *app) logsLoop() {
	t := time.NewTicker(5 * time.Second)
	for range t.C {
		if a.visible.Load() {
			a.loadLogs()
		}
	}
}

func (a *app) refresh() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resp, err := a.client.Status(ctx)
	a.mu.Lock()
	if err != nil {
		a.status, a.connErr = nil, err.Error()
	} else if !resp.Ok || resp.Status == nil {
		a.status, a.connErr = nil, resp.Message
	} else {
		a.status, a.connErr = resp.Status, ""
	}
	s, connErr := a.status, a.connErr
	a.mu.Unlock()
	fyne.Do(func() { a.render(s, connErr) })
}

func (a *app) currentStatus() *state.Status {
	a.mu.Lock()
	defer a.mu.Unlock()
	return a.status
}

func (a *app) render(s *state.Status, connErr string) {
	var icon, text string
	switch {
	case s == nil:
		icon, text = "off", "Serviço parado ou inacessível"
	case !s.Configured:
		icon, text = "warn", "Credenciais não configuradas"
	case !s.AuthOK || s.LastError != "":
		icon, text = "warn", s.LastError
		if text == "" {
			text = "Falha de autenticação"
		}
	case s.Running:
		icon, text = "ok", "Extração em andamento…"
	default:
		icon, text = "ok", "Ativo"
		if s.NextRunAt != nil {
			text = fmt.Sprintf("Ativo · próxima extração %s", s.NextRunAt.Format("02/01 15:04"))
		}
	}
	a.statusItem.Label = text
	a.runItem.Disabled = s == nil || !s.Configured || s.Running
	a.menu.Refresh()
	a.setIcon(icon)

	a.panel.render(s, connErr)
}

// ---------------------------------------------------------------- actions

func (a *app) setFeedback(ok bool, msg string) {
	fyne.Do(func() { a.panel.setFeedback(ok, msg) })
}

func (a *app) save() {
	var id, secret, url string
	fyne.DoAndWait(func() {
		p := a.panel
		id, secret, url = strings.TrimSpace(p.clientID.Text), strings.TrimSpace(p.secret.Text), strings.TrimSpace(p.apiURL.Text)
		p.saveBtn.Disable()
		p.feedback.Text, p.feedback.Color = "Validando credenciais na API…", cFgMedium
		p.feedback.Refresh()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	resp, err := (&control.Client{Timeout: 60 * time.Second}).Configure(ctx, id, secret, url)
	switch {
	case err != nil:
		a.setFeedback(false, err.Error())
	case !resp.Ok:
		a.setFeedback(false, resp.Message)
	default:
		a.setFeedback(true, "Credenciais salvas. O serviço já está usando a nova configuração.")
	}
	fyne.Do(func() { a.panel.saveBtn.Enable() })
	a.refresh()
}

func (a *app) runNow() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resp, err := a.client.Run(ctx)
	if err != nil {
		a.setFeedback(false, err.Error())
	} else {
		a.setFeedback(resp.Ok, resp.Message)
	}
	a.refresh()
	go a.loadLogs()
}

func (a *app) clearLogs() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resp, err := a.client.ClearLogs(ctx)
	if err != nil {
		a.setFeedback(false, err.Error())
	} else {
		a.setFeedback(resp.Ok, resp.Message)
	}
	go a.loadLogs()
}

func (a *app) openLogs() {
	dir := defaultDataDir()
	if s := a.currentStatus(); s != nil && s.DataDir != "" {
		dir = s.DataDir
	}
	_ = openFolder(filepath.Join(dir, "logs"))
}

// loadLogs fetches the last 200 lines ("timestamp level message") and hands them to the panel.
func (a *app) loadLogs() {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	resp, err := a.client.Logs(ctx, 200)
	var lines []string
	if err != nil {
		lines = []string{err.Error()}
	} else {
		lines = resp.Logs
	}
	fyne.Do(func() { a.panel.setLogs(lines) })
}

// exportLogs asks where to save, fetches every log line from the service and writes the file.
func (a *app) exportLogs() {
	fyne.Do(func() {
		d := dialog.NewFileSave(func(w fyne.URIWriteCloser, err error) {
			if err != nil || w == nil {
				return
			}
			a.setFeedback(true, "Exportando logs…")
			go func() {
				defer w.Close()
				ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
				defer cancel()
				resp, err := (&control.Client{Timeout: 60 * time.Second}).ExportLogs(ctx)
				if err == nil && !resp.Ok {
					err = errors.New(resp.Message)
				}
				if err == nil {
					header := ""
					if s := a.currentStatus(); s != nil {
						header = "versão " + s.Version + " · client " + s.ClientID + " · dados em " + s.DataDir
					}
					err = control.WriteLogExport(w, resp.Logs, header)
				}
				if err != nil {
					a.setFeedback(false, "Não foi possível exportar os logs: "+err.Error())
					return
				}
				a.setFeedback(true, fmt.Sprintf("%d linhas exportadas para %s", len(resp.Logs), w.URI().Name()))
			}()
		}, a.window)
		d.SetFileName(control.ExportFileName())
		d.SetFilter(storage.NewExtensionFileFilter([]string{".txt", ".log"}))
		if home, err := os.UserHomeDir(); err == nil {
			for _, sub := range []string{"Documents", "Documentos", ""} {
				if l, err := storage.ListerForURI(storage.NewFileURI(filepath.Join(home, sub))); err == nil {
					d.SetLocation(l)
					break
				}
			}
		}
		d.Resize(fyne.NewSize(680, 480))
		d.Show()
	})
}
