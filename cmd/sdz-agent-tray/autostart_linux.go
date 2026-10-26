//go:build linux

package main

import (
	"os"
	"path/filepath"
)

// Per-user "start at login" through XDG autostart. A system-wide entry installed by the
// package (/etc/xdg/autostart) is disabled with a user override marked Hidden=true.
func autostartPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".config", "autostart", "sdz-agent-tray.desktop")
}

func autostartEnabled() bool {
	if b, err := os.ReadFile(autostartPath()); err == nil {
		return !containsLine(string(b), "Hidden=true")
	}
	_, err := os.Stat("/etc/xdg/autostart/sdz-agent-tray.desktop")
	return err == nil
}

func autostartSet(enabled bool) error {
	p := autostartPath()
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if !enabled {
		return os.WriteFile(p, []byte("[Desktop Entry]\nType=Application\nName=SDZ Agent\nHidden=true\n"), 0o644)
	}
	exe, _ := os.Executable()
	return os.WriteFile(p, []byte("[Desktop Entry]\nType=Application\nName=SDZ Agent\nComment=Seedz integration agent tray\nExec="+exe+"\nIcon=sdz-agent\nTerminal=false\nX-GNOME-Autostart-enabled=true\nStartupWMClass=sdz-agent-tray\n"), 0o644)
}
