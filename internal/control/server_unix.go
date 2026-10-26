//go:build !windows

package control

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"path/filepath"
)

func (s *Server) listen() (net.Listener, string, error) {
	path := ServerSocketPath(s.paths.DataDir)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, path, err
	}
	_ = os.Remove(path)
	l, err := net.Listen("unix", path)
	if err != nil {
		return nil, path, err
	}
	s.applyPermissions(path)
	return l, path, nil
}

func (s *Server) applyPermissions(path string) {
	mode := s.env.GetOrEmpty("SDZ_AGENT_CONTROL_MODE")
	group := s.env.GetOrEmpty("SDZ_AGENT_CONTROL_GROUP")
	if group == "" {
		group = "sdz-agent"
	}
	chown := false
	if os.Geteuid() == 0 {
		chown = exec.Command("chgrp", group, path).Run() == nil
	}
	var perm os.FileMode
	switch mode {
	case "0666", "666":
		perm = 0o666
	case "0600", "600":
		perm = 0o600
	default:
		if chown {
			perm = 0o660
		} else {
			perm = 0o666
		}
	}
	if err := os.Chmod(path, perm); err != nil {
		s.logger.Warn("COULD NOT SET CONTROL SOCKET PERMISSIONS", err.Error())
		return
	}
	if !chown && mode == "" && os.Geteuid() == 0 {
		s.logger.Warn(fmt.Sprintf("GROUP %s NOT FOUND, CONTROL SOCKET IS WORLD-WRITABLE (set SDZ_AGENT_CONTROL_MODE=0600 to restrict)", group))
	}
}

func (s *Server) cleanup(addr string) { _ = os.Remove(addr) }
