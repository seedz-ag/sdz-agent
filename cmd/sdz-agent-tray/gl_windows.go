//go:build windows

package main

import (
	"bytes"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/sys/windows"
)

// setupDiagnostics sends the Go log (where Fyne reports its errors) to
// %LOCALAPPDATA%\SEEDZ\sdz-agent\tray.log, since a windowsgui exe has no stderr, and
// turns the one fatal Fyne error a user can hit (no OpenGL 2.0, typical of VMs and RDP
// sessions without the Mesa DLLs) into a native message box before Fyne exits the process.
func setupDiagnostics() {
	var w io.Writer = io.Discard
	if base := os.Getenv("LOCALAPPDATA"); base != "" {
		dir := filepath.Join(base, "SEEDZ", "sdz-agent")
		_ = os.MkdirAll(dir, 0o755)
		if f, err := os.OpenFile(filepath.Join(dir, "tray.log"), os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644); err == nil {
			w = f
			os.Stderr = f
		}
	}
	log.SetOutput(&glWatcher{out: w})
	log.Printf("sdz-agent-tray starting (pid %d, exe %s)", os.Getpid(), exePath())
}

func exePath() string {
	p, _ := os.Executable()
	return p
}

type glWatcher struct {
	out  io.Writer
	once sync.Once
}

func (g *glWatcher) Write(p []byte) (int, error) {
	n, err := g.out.Write(p)
	if bytes.Contains(p, []byte("window creation error")) || bytes.Contains(p, []byte("failed to initialise GLFW")) || bytes.Contains(p, []byte("init failed")) {
		g.once.Do(func() { explainNoOpenGL(strings.TrimSpace(string(p))) })
	}
	return n, err
}

func explainNoOpenGL(detail string) {
	text := "O painel do SDZ Agent não pôde abrir porque esta sessão do Windows não oferece OpenGL 2.0 " +
		"(comum em máquinas virtuais e acesso remoto).\r\n\r\n" +
		"O instalador inclui o Mesa (OpenGL por software): confira se opengl32.dll, libgallium_wgl.dll e dxil.dll " +
		"estão na pasta do sdz-agent-tray.exe.\r\n\r\n" +
		"Enquanto isso, as credenciais podem ser gerenciadas pelo terminal (como administrador):\r\n" +
		"  sdz-agent.exe credentials set | show | test | clear\r\n\r\n" +
		"Detalhe: " + detail + "\r\nLog: %LOCALAPPDATA%\\SEEDZ\\sdz-agent\\tray.log"
	caption := "SDZ Agent"
	_, _ = windows.MessageBox(0, windows.StringToUTF16Ptr(text), windows.StringToUTF16Ptr(caption), windows.MB_OK|windows.MB_ICONWARNING|windows.MB_SETFOREGROUND)
}
