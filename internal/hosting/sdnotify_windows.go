//go:build windows

package hosting

// NotifyReady is a no-op on Windows (the SCM is driven by kardianos/service).
func NotifyReady() {}
