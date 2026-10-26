//go:build !windows

package update

import "os/exec"

// nsisSilentCommand is only meaningful on Windows.
func nsisSilentCommand(file, dir string) *exec.Cmd { return exec.Command(file, "/S", "/D="+dir) }
