package control

import (
	"os"
	"os/user"
	"path/filepath"
)

const (
	PipeName            = "sdz-agent-control"
	PipePath            = `\\.\pipe\sdz-agent-control`
	EnvironmentVariable = "SDZ_AGENT_CONTROL"
	SystemSocketDir     = "/run/sdz-agent"
)

func SystemSocketPath() string { return filepath.Join(SystemSocketDir, "control.sock") }

func FallbackSocketPath() string {
	name := "unknown"
	if u, err := user.Current(); err == nil && u.Username != "" {
		name = u.Username
	}
	return filepath.Join(os.TempDir(), "sdz-agent-"+name+".sock")
}

// ServerSocketPath: $SDZ_AGENT_CONTROL, else /run/sdz-agent when writable, else <dataDir>/control.sock (≤100 chars), else temp.
func ServerSocketPath(dataDir string) string {
	if v := os.Getenv(EnvironmentVariable); v != "" {
		return v
	}
	if dirUsable(SystemSocketDir) {
		return SystemSocketPath()
	}
	local := filepath.Join(dataDir, "control.sock")
	if len(local) <= 100 {
		return local
	}
	return FallbackSocketPath()
}

func dirUsable(dir string) bool {
	if _, err := os.Stat(dir); err != nil {
		if os.Geteuid() != 0 {
			return false
		}
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return false
		}
	}
	probe := filepath.Join(dir, ".probe")
	if err := os.WriteFile(probe, nil, 0o600); err != nil {
		return false
	}
	_ = os.Remove(probe)
	return true
}

// ClientSocketCandidates lists the socket paths a client tries, in order.
func ClientSocketCandidates() []string {
	var out []string
	if v := os.Getenv(EnvironmentVariable); v != "" {
		out = append(out, v)
	}
	out = append(out, SystemSocketPath(), "/var/lib/sdz-agent/control.sock")
	if home, err := os.UserHomeDir(); err == nil {
		out = append(out, filepath.Join(home, ".sdz-agent", "control.sock"))
	}
	return append(out, FallbackSocketPath())
}
