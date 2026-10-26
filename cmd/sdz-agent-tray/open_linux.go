//go:build linux

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"time"
)

// openWith tries each launcher until one accepts the target. A launcher that exits
// non-zero within a second (no handler, not installed) is skipped.
func openWith(target string, launchers [][]string) error {
	var lastErr error
	for _, l := range launchers {
		if _, err := exec.LookPath(l[0]); err != nil {
			continue
		}
		cmd := exec.Command(l[0], append(l[1:], target)...)
		cmd.Stdout, cmd.Stderr = os.Stderr, os.Stderr
		if err := cmd.Start(); err != nil {
			lastErr = err
			continue
		}
		done := make(chan error, 1)
		go func() { done <- cmd.Wait() }()
		select {
		case err := <-done:
			if err != nil {
				lastErr = fmt.Errorf("%s: %w", l[0], err)
				continue
			}
			fmt.Fprintf(os.Stderr, "aberto com %s: %s\n", l[0], target)
			return nil
		case <-time.After(1500 * time.Millisecond):
			// still running: the launcher took it (browsers keep running)
			fmt.Fprintf(os.Stderr, "aberto com %s: %s\n", l[0], target)
			return nil
		}
	}
	if lastErr == nil {
		lastErr = errors.New("nenhum navegador encontrado (xdg-open, gio, google-chrome, firefox, chromium)")
	}
	return lastErr
}

func openInBrowser(url string) error {
	return openWith(url, [][]string{
		{"xdg-open"}, {"gio", "open"}, {"sensible-browser"}, {"x-www-browser"},
		{"google-chrome"}, {"google-chrome-stable"}, {"firefox"}, {"chromium"}, {"chromium-browser"},
	})
}

func openFolder(path string) error {
	return openWith(path, [][]string{{"xdg-open"}, {"gio", "open"}, {"nautilus"}, {"dolphin"}, {"thunar"}})
}
