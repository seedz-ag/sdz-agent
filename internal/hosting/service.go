package hosting

import (
	"fmt"
	"os"

	"github.com/kardianos/service"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

const (
	ServiceName = "SDZ-AGENT"
	DisplayName = "SDZ Agent"
)

// IsServiceContext reports whether we were started by a service manager (or asked to behave as such).
func IsServiceContext() bool {
	if os.Getenv("SDZ_AGENT_SERVICE") == "1" || os.Getenv("NOTIFY_SOCKET") != "" {
		return true
	}
	return !service.Interactive()
}

func config(paths *core.Paths) *service.Config {
	return &service.Config{
		Name:             ServiceName,
		DisplayName:      DisplayName,
		Description:      "Seedz Agent",
		Arguments:        []string{"run"},
		WorkingDirectory: paths.DataDir,
		EnvVars:          map[string]string{core.DataDirVariable: paths.DataDir, "SDZ_AGENT_SERVICE": "1"},
		Option: service.KeyValue{
			"Restart":                "always",
			"RestartSec":             60,
			"OnFailure":              "restart",
			"OnFailureDelayDuration": "60s",
			"LogOutput":              true,
			"SystemdScript":          "",
			"RunAtLoad":              true,
			"KeepAlive":              true,
			"StartType":              "automatic",
			"DelayedAutoStart":       true, // Windows: start after the network stack is up
		},
	}
}

type noop struct{}

func (noop) Start(service.Service) error { return nil }
func (noop) Stop(service.Service) error  { return nil }

// Manage implements `sdz-agent service install|uninstall|start|stop|status`.
func Manage(action string, paths *core.Paths) error {
	svc, err := service.New(noop{}, config(paths))
	if err != nil {
		return err
	}
	switch action {
	case "install":
		if err := paths.EnsureDirectories(); err != nil {
			return err
		}
		if err := svc.Install(); err != nil {
			return err
		}
		fmt.Printf("service %s installed\n", ServiceName)
		if err := svc.Start(); err != nil {
			fmt.Printf("service installed but not started: %v\n", err)
		}
		return nil
	case "uninstall":
		_ = svc.Stop()
		if err := svc.Uninstall(); err != nil {
			return err
		}
		fmt.Printf("service %s removed\n", ServiceName)
		return nil
	case "start":
		return svc.Start()
	case "stop":
		return svc.Stop()
	case "restart":
		return svc.Restart()
	case "status":
		st, err := svc.Status()
		if err != nil {
			return err
		}
		switch st {
		case service.StatusRunning:
			fmt.Println("running")
		case service.StatusStopped:
			fmt.Println("stopped")
		default:
			fmt.Println("unknown")
		}
		return nil
	default:
		return fmt.Errorf("unknown service action '%s'", action)
	}
}
