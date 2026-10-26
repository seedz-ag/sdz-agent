package services

import (
	"bufio"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync/atomic"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

// VPN writes the OpenVPN profile from the setting and runs openvpn (port of VPNService).
type VPN struct {
	paths     *core.Paths
	logger    *core.Logger
	security  *api.Security
	files     []string
	cmd       *exec.Cmd
	connected atomic.Bool
}

func NewVPN(paths *core.Paths, logger *core.Logger) *VPN { return &VPN{paths: paths, logger: logger} }

func (v *VPN) Configure(s *api.Security) *VPN { v.security = s; return v }
func (v *VPN) IsConnected() bool          { return v.connected.Load() }

func (v *VPN) Connect() error {
	if v.security == nil {
		return errors.New("VPN NOT CONFIGURED")
	}
	config := filepath.Join(v.paths.DataDir, "config.ovpn")
	if err := os.WriteFile(config, []byte(v.security.Config), 0o600); err != nil {
		return err
	}
	v.files = append(v.files, config)
	if c := v.security.Credentials; c != nil {
		userPass := filepath.Join(v.paths.DataDir, "user-pass.txt")
		_ = os.WriteFile(userPass, []byte(c.Username+"\n"+c.Password), 0o600)
		v.files = append(v.files, userPass)
	}
	name, args := v.command(config)
	v.logger.Infof("STARTING VPN: %s %s", name, strings.Join(args, " "))
	cmd := exec.Command(name, args...)
	cmd.Dir = v.paths.DataDir
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		v.clearFiles()
		return err
	}
	v.cmd = cmd
	ready := make(chan bool, 1)
	go func() {
		sc := bufio.NewScanner(stdout)
		for sc.Scan() {
			line := sc.Text()
			v.logger.Info(line)
			if strings.Contains(line, "Initialization Sequence Completed") {
				v.connected.Store(true)
				select {
				case ready <- true:
				default:
				}
			}
			if strings.Contains(line, "SIGTERM") {
				v.connected.Store(false)
			}
		}
		_ = cmd.Wait()
		v.connected.Store(false)
		select {
		case ready <- false:
		default:
		}
	}()
	select {
	case ok := <-ready:
		if !ok {
			_ = v.Disconnect()
			return errors.New("VPN CONNECTION TIMEOUT")
		}
	case <-time.After(60 * time.Second):
		_ = v.Disconnect()
		return errors.New("VPN CONNECTION TIMEOUT")
	}
	v.clearFiles()
	return nil
}

func (v *VPN) Disconnect() error {
	defer func() {
		v.connected.Store(false)
		v.clearFiles()
	}()
	if v.cmd != nil && v.cmd.Process != nil {
		if err := v.cmd.Process.Kill(); err != nil {
			v.logger.Warn("VPN DISCONNECT ERROR", err.Error())
		}
	}
	return nil
}

func (v *VPN) command(config string) (string, []string) {
	if runtime.GOOS == "windows" {
		candidates := []string{filepath.Join(os.Getenv("ProgramFiles"), "OpenVPN", "bin", "openvpn.exe"), "openvpn.exe"}
		for _, c := range candidates {
			if _, err := os.Stat(c); err == nil {
				return c, []string{"--config", config}
			}
		}
		return "openvpn.exe", []string{"--config", config}
	}
	if os.Geteuid() == 0 {
		return "openvpn", []string{"--config", config}
	}
	return "sudo", []string{"--", "sh", "-c", fmt.Sprintf("openvpn --config '%s'", config)}
}

func (v *VPN) clearFiles() {
	for _, f := range v.files {
		_ = os.Remove(f)
	}
	v.files = nil
}
