//go:build !windows

package main

func trayIcon(state string) []byte {
	switch state {
	case "ok":
		return asset("assets/tray-ok.png")
	case "warn":
		return asset("assets/tray-warn.png")
	default:
		return asset("assets/tray-off.png")
	}
}
