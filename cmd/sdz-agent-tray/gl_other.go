//go:build !windows

package main

// setupDiagnostics is a no-op outside Windows: stderr is available there.
func setupDiagnostics() {}
