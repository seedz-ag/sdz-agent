// Package hosting runs the agent as an OS service (Windows SCM, systemd, launchd) and exposes the control channel.
package hosting

import "context"

// Runner is what the long-running host drives; implemented by the commands package and wired in main.
type Runner interface {
	// RunScheduler blocks until ctx is cancelled: loads the setting, schedules its cron jobs, keeps the listen stream open.
	RunScheduler(ctx context.Context) error
	// RequestRestart makes the scheduler re-read the setting (after a reconfiguration).
	RequestRestart()
	// CheckAuth validates the current credentials against the API.
	CheckAuth(ctx context.Context) bool
	// ConsumeOutputLogs re-ships output/*.log entries that failed earlier.
	ConsumeOutputLogs(ctx context.Context) error
	// Execute runs one extraction now; IsRunning tells whether one is in progress.
	Execute(ctx context.Context) error
	IsRunning() bool
	// Configure validates credentials against the API and persists them; returns a user-facing error message on failure.
	Configure(ctx context.Context, clientID, clientSecret, apiURL string) error
	// Clear removes the saved credentials; the scheduler idles until the next Configure.
	Clear() error
	// RunListen keeps the command channel (remote management) open until ctx ends, independent of the scheduler.
	RunListen(ctx context.Context)
}
