package main

import "os/exec"

func openInBrowser(url string) error {
	return exec.Command("rundll32", "url.dll,FileProtocolHandler", url).Start()
}
func openFolder(path string) error { return exec.Command("explorer.exe", path).Start() }
