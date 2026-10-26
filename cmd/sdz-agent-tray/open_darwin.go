package main

import "os/exec"

func openInBrowser(url string) error { return exec.Command("open", url).Start() }
func openFolder(path string) error   { return exec.Command("open", path).Start() }
