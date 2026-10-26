package core

import (
	"os"
	"path/filepath"
	"runtime"
)

// DataDirVariable overrides the data directory (.env, output/, logs/).
const DataDirVariable = "SDZ_AGENT_DATA_DIR"

// Paths resolves where the agent keeps its mutable state. Resolution order:
// SDZ_AGENT_DATA_DIR, the current directory when it has a .env, then the platform
// default (Windows: the install folder next to the exe; /var/lib/sdz-agent when usable; ~/.sdz-agent).
type Paths struct {
	AppDir  string
	DataDir string
}

func NewPaths() *Paths { return NewPathsAt(ResolveDataDir()) }

func NewPathsAt(dataDir string) *Paths {
	exe, _ := os.Executable()
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		abs = dataDir
	}
	return &Paths{AppDir: filepath.Dir(exe), DataDir: abs}
}

func (p *Paths) OutputDir() string  { return filepath.Join(p.DataDir, "output") }
func (p *Paths) LogsDir() string    { return filepath.Join(p.DataDir, "logs") }
func (p *Paths) EnvFile() string    { return filepath.Join(p.DataDir, ".env") }
func (p *Paths) UpdatesDir() string { return filepath.Join(p.DataDir, "updates") }
func (p *Paths) Output(name string) string {
	return filepath.Join(p.OutputDir(), name)
}

func (p *Paths) EnsureDirectories() error {
	for _, d := range []string{p.DataDir, p.OutputDir(), p.LogsDir()} {
		if err := os.MkdirAll(d, 0o750); err != nil {
			return err
		}
	}
	return nil
}

func ResolveDataDir() string {
	if v := os.Getenv(DataDirVariable); v != "" {
		return v
	}
	if runtime.GOOS == "windows" {
		// a Windows service starts in C:\Windows\System32, so the current directory is never used
		// there: everything the agent produces stays in the installation folder, next to the exe
		dir := WindowsInstallDir()
		migrateLegacyWindowsEnv(dir)
		return dir
	}
	if cwd, err := os.Getwd(); err == nil {
		if _, err := os.Stat(filepath.Join(cwd, ".env")); err == nil {
			return cwd
		}
	}
	const system = "/var/lib/sdz-agent"
	if usable(system) {
		return system
	}
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".sdz-agent")
}

// WindowsInstallDir is the folder of sdz-agent.exe (the install folder chosen in the installer).
func WindowsInstallDir() string {
	exe, err := os.Executable()
	if err != nil {
		cwd, _ := os.Getwd()
		return cwd
	}
	if real, err := filepath.EvalSymlinks(exe); err == nil {
		exe = real
	}
	return filepath.Dir(exe)
}

// LegacyWindowsDataDir is the data dir used by builds before 3.0.0 on Windows.
func LegacyWindowsDataDir() string {
	base := os.Getenv("ProgramData")
	if base == "" {
		base = `C:\ProgramData`
	}
	return filepath.Join(base, "SEEDZ", "sdz-agent")
}

// migrateLegacyWindowsEnv copies a .env left by an older build (best effort, once).
func migrateLegacyWindowsEnv(installDir string) {
	target := filepath.Join(installDir, ".env")
	if _, err := os.Stat(target); err == nil {
		return
	}
	b, err := os.ReadFile(filepath.Join(LegacyWindowsDataDir(), ".env"))
	if err != nil {
		return
	}
	_ = os.WriteFile(target, b, 0o600)
}

func usable(dir string) bool {
	if _, err := os.Stat(dir); err != nil {
		if os.Geteuid() != 0 {
			return false
		}
		if err := os.MkdirAll(dir, 0o750); err != nil {
			return false
		}
	}
	probe := filepath.Join(dir, ".write-probe")
	if err := os.WriteFile(probe, nil, 0o600); err != nil {
		return false
	}
	_ = os.Remove(probe)
	return true
}
