package hosting

import (
	"context"
	"strings"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/control"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry/collector"
	"github.com/seedz-ag/sdz-agent-go/internal/update"
)

// Deps are the collaborators of the long-running service mode.
type Deps struct {
	Env       *core.Env
	Paths     *core.Paths
	Logger    *core.Logger
	State     *state.State
	Control   *control.Server
	Updates   *update.Service
	Telemetry *collector.Service
}

// RunService is the port of AgentWorker: scheduler + listen forever, control channel, periodic self-update.
func RunService(ctx context.Context, runner Runner, deps Deps) error {
	deps.Logger.Infof("SDZ AGENT %s STARTING AS A SERVICE", core.Version)
	deps.Env.Set("FOREVER", "true")
	if deps.Env.GetOrEmpty("LISTEN") == "" {
		deps.Env.Set("LISTEN", "true")
	}

	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	// the control channel comes up first so the tray can reach the service (and fix the credentials)
	// even while the startup auth check is still retrying
	if deps.Control != nil {
		deps.Control.RunContext = ctx
		go func() { _ = deps.Control.Serve(ctx) }()
	}
	NotifyReady()

	// the command channel (remote management, remote updates) lives for the whole process,
	// independent of the setting/scheduler cycle and of the startup auth check
	if deps.Env.Listen() {
		go runner.RunListen(ctx)
	}

	configured := deps.Env.Configured()
	if !configured {
		deps.Logger.Warn("AGENT NOT CONFIGURED: waiting for credentials from the tray app or `sdz-agent configure`")
		deps.State.SetError("AGENT NOT CONFIGURED")
	}
	healthy := configured && checkAuthWithRetry(ctx, runner, deps.Logger, func() bool { return deps.State.AuthOK })
	deps.State.AuthOK = healthy
	if healthy {
		if deps.Updates != nil {
			deps.Updates.MarkHealthy()
		}
	} else {
		deps.Logger.Warn("AUTH CHECK FAILED AT STARTUP (will keep retrying)")
		if deps.Updates != nil && deps.Updates.RegisterStartFailure() {
			return nil
		}
	}

	if configured {
		if err := runner.ConsumeOutputLogs(ctx); err != nil {
			deps.Logger.Error("IMPOSSIBLE TO CONSUME LOG, MAYBE ANOTHER TIME", err.Error())
		}
	}

	if deps.Updates != nil {
		go runUpdateLoop(ctx, deps)
	}

	err := runner.RunScheduler(ctx)
	if deps.Telemetry != nil {
		deps.Telemetry.Stop()
	}
	if err != nil && ctx.Err() == nil {
		deps.Logger.Error("SCHEDULER STOPPED", err.Error())
	}
	return nil
}

// checkAuthWithRetry: at boot the network (DNS, VPN, proxy) is often not ready when the service
// starts, so the auth check is retried for a couple of minutes before the start counts as unhealthy
// (which feeds the post-update rollback counter). The scheduler keeps retrying forever afterwards.
func checkAuthWithRetry(ctx context.Context, runner Runner, logger *core.Logger, reconfigured func() bool) bool {
	const attempts = 6
	for i := 1; i <= attempts; i++ {
		if runner.CheckAuth(ctx) {
			return true
		}
		if i == attempts {
			break
		}
		logger.Warnf("AUTH CHECK FAILED AT STARTUP (ATTEMPT %d/%d), RETRYING IN 20S", i, attempts)
		// wake up early when new credentials arrive through the control channel (validated there)
		for t := 0; t < 20; t++ {
			if reconfigured() {
				return true
			}
			select {
			case <-ctx.Done():
				return false
			case <-time.After(time.Second):
			}
		}
	}
	return false
}

func runUpdateLoop(ctx context.Context, deps Deps) {
	if !deps.Updates.AutoUpdateEnabled() {
		return
	}
	select {
	case <-ctx.Done():
		return
	case <-time.After(5 * time.Minute):
	}
	for {
		version, err := deps.Updates.CheckAndApply(ctx, true)
		if err != nil && ctx.Err() == nil {
			deps.Logger.Warn("UPDATE CHECK FAILED", err.Error())
		}
		if version != "" {
			deps.Logger.Infof("UPDATE TO %s LAUNCHED, WAITING FOR THE INSTALLER TO RESTART THE SERVICE", version)
			return
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(6 * time.Hour):
		}
	}
}

// IsConfigured mirrors the worker's notion of "configured" for callers.
func IsConfigured(env *core.Env) bool {
	return strings.TrimSpace(env.ClientID()) != "" && strings.TrimSpace(env.ClientSecret()) != ""
}
