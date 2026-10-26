package main

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func containsLine(s, line string) bool {
	for _, l := range strings.Split(s, "\n") {
		if strings.TrimSpace(l) == line {
			return true
		}
	}
	return false
}

// defaultDataDir mirrors the service's platform default (used when the service is unreachable).
func defaultDataDir() string {
	if runtime.GOOS == "windows" {
		// tray and service share the install folder
		exe, err := os.Executable()
		if err == nil {
			return filepath.Dir(exe)
		}
		return `C:\Program Files\SEEDZ\sdz-agent`
	}
	return "/var/lib/sdz-agent"
}
