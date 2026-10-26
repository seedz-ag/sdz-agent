package main

// Windows system tray expects ICO bytes; the three states share the Seedz icon in
// different colours, but the .ico only carries the green one, so the colour is
// conveyed by the tooltip/menu text on Windows.
func trayIcon(state string) []byte {
	_ = state
	return asset("assets/sdz-agent.ico")
}
