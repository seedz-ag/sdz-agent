package main

import "embed"

//go:embed assets/tray-ok.png assets/tray-warn.png assets/tray-off.png assets/app-icon.png assets/sdz-agent.ico assets/logo.png
var assets embed.FS

func asset(name string) []byte {
	b, err := assets.ReadFile(name)
	if err != nil {
		return nil
	}
	return b
}
