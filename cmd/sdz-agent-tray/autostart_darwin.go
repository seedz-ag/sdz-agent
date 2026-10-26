package main

import (
	"os"
	"path/filepath"
)

func autostartPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, "Library", "LaunchAgents", "ag.seedz.sdz-agent-tray.plist")
}

func autostartEnabled() bool {
	_, err := os.Stat(autostartPath())
	return err == nil
}

func autostartSet(enabled bool) error {
	p := autostartPath()
	if !enabled {
		err := os.Remove(p)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	exe, _ := os.Executable()
	return os.WriteFile(p, []byte(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>ag.seedz.sdz-agent-tray</string>
  <key>ProgramArguments</key><array><string>`+exe+`</string></array>
  <key>RunAtLoad</key><true/>
</dict></plist>
`), 0o644)
}
