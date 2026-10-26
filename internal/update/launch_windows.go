//go:build windows

package update

import (
	"os/exec"
	"strings"
	"syscall"
)

// nsisSilentCommand runs `setup.exe /S /D=<dir>`. NSIS requires /D= last and unquoted (even with
// spaces), so the command line is passed verbatim instead of letting Go quote the argument.
func nsisSilentCommand(file, dir string) *exec.Cmd {
	cmd := exec.Command(file)
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `"` + file + `" /S /D=` + strings.TrimRight(dir, `\/`)}
	return cmd
}
