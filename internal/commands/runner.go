package commands

import (
	"context"
	"errors"
	"fmt"
	"os"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/services"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
)

// Runner adapts the commands to the hosting.Runner contract used by the service host and the control channel.
type Runner struct {
	Listen    *Listen
	Env       *core.Env
	Paths     *core.Paths
	State     *state.State
	Scheduler *Scheduler
	Check     *Check
	Logs      *services.Logs
	Exec      *Execute
	Config    *Configure
	Logger    *core.Logger
}

func (r *Runner) RunScheduler(ctx context.Context) error { return r.Scheduler.Run(ctx) }

// RunListen runs the command channel in its own loop and tells the scheduler not to start another one.
func (r *Runner) RunListen(ctx context.Context) {
	r.Scheduler.ExternalListen = true
	r.State.Listening = true
	r.Listen.RunForever(ctx)
}
func (r *Runner) RequestRestart()                             { r.Scheduler.RequestRestart() }
func (r *Runner) CheckAuth(ctx context.Context) bool          { return r.Check.CheckAuth(ctx) }
func (r *Runner) ConsumeOutputLogs(ctx context.Context) error { return r.Logs.ConsumeOutput(ctx) }
func (r *Runner) IsRunning() bool                             { return r.Exec.IsRunning() }

func (r *Runner) Execute(ctx context.Context) error {
	err := r.Exec.Run(ctx)
	if err != nil {
		r.State.ExecutionFinished(false, err.Error())
	} else {
		r.State.ExecutionFinished(true, "")
	}
	return err
}

// Clear deletes the .env and puts the scheduler back to the "waiting for credentials" state.
func (r *Runner) Clear() error {
	if err := os.Remove(r.Paths.EnvFile()); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("COULD NOT REMOVE %s: %w", r.Paths.EnvFile(), err)
	}
	r.Env.SkipCredCheck = true
	_ = r.Env.Parse()
	r.State.AuthOK = false
	r.State.SetSchedules(nil)
	r.State.SetNextRun(nil)
	r.State.SetError("AGENT NOT CONFIGURED")
	r.Scheduler.RequestRestart()
	r.Listen.Reconnect()
	return nil
}

func (r *Runner) Configure(ctx context.Context, clientID, clientSecret, apiURL string) error {
	if err := r.Config.Save(ctx, clientID, clientSecret, apiURL); err != nil {
		return err
	}
	r.Env.SkipCredCheck = false
	_ = r.Env.Parse()
	r.State.AuthOK = true
	r.State.SetError("")
	r.Logger.Info("CREDENTIALS UPDATED THROUGH THE CONTROL CHANNEL, RESTARTING SCHEDULER")
	r.Scheduler.RequestRestart()
	r.Listen.Reconnect()
	return nil
}
