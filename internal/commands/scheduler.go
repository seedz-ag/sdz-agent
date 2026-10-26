package commands

import (
	"context"
	"errors"
	"strings"
	"sync"
	"time"

	"github.com/robfig/cron/v3"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry/collector"
)

var errSettingChanged = errors.New("SETTING CHANGED, RESTARTING SCHEDULER")

// Scheduler schedules one job per setting cron expression, keeps the listen stream
// open and restarts whenever the setting changes (checked every 60 s).
type Scheduler struct {
	api       *api.Service
	env       *core.Env
	execute   *Execute
	listen    *Listen
	logger    *core.Logger
	telemetry *collector.Service
	state     *state.State
	mu        sync.Mutex
	cancel    context.CancelFunc
	restart   bool
	// ExternalListen is set by the service host, which keeps the command channel in its own loop.
	ExternalListen bool
}

func NewScheduler(a *api.Service, env *core.Env, e *Execute, l *Listen, logger *core.Logger, t *collector.Service, st *state.State) *Scheduler {
	return &Scheduler{api: a, env: env, execute: e, listen: l, logger: logger, telemetry: t, state: st}
}

// RequestRestart cancels the current cycle so the setting is re-read (after a reconfiguration).
func (s *Scheduler) RequestRestart() {
	s.mu.Lock()
	s.restart = true
	cancel := s.cancel
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func (s *Scheduler) setCycle(cancel context.CancelFunc) {
	s.mu.Lock()
	s.cancel = cancel
	s.mu.Unlock()
}

func (s *Scheduler) restartPending() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.restart
}

func (s *Scheduler) takeRestart() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	r := s.restart
	s.restart = false
	return r
}

func (s *Scheduler) Run(ctx context.Context) error {
	for ctx.Err() == nil {
		if !s.env.Configured() {
			idle, cancel := context.WithCancel(ctx)
			s.setCycle(cancel)
			if s.restartPending() {
				cancel()
			}
			select {
			case <-idle.Done():
			case <-time.After(5 * time.Minute):
			}
			cancel()
			s.setCycle(nil)
			s.takeRestart()
			continue
		}
		err := s.runUntilSettingChanges(ctx)
		switch {
		case ctx.Err() != nil:
			s.logger.Info("STOPING SCHEDULER")
			return nil
		case errors.Is(err, errSettingChanged):
			continue
		case err != nil && s.takeRestart():
			continue
		case err != nil:
			s.logger.Error("SCHEDULER ERROR", err.Error())
			s.state.SetError(err.Error())
			if !s.env.Forever() {
				return err
			}
			select {
			case <-time.After(60 * time.Second):
			case <-ctx.Done():
				return nil
			}
		default:
			if !s.env.Forever() {
				return nil
			}
		}
	}
	return nil
}

// ParseCron accepts 5-field (standard) and 6-field (with seconds) expressions like node-schedule.
func ParseCron(expr string) (cron.Schedule, error) {
	fields := strings.Fields(expr)
	if len(fields) >= 6 {
		return cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow | cron.Descriptor).Parse(expr)
	}
	return cron.ParseStandard(expr)
}

func (s *Scheduler) runUntilSettingChanges(ctx context.Context) error {
	s.telemetry.Start("scheduler")
	s.logger.Info("STARTING SCHEDULER")
	setting, err := s.api.GetSetting(ctx)
	if err != nil {
		return err
	}
	snapshot := core.MustJSON(setting)
	s.state.AuthOK = true
	s.state.SetError("")
	exprs := make([]string, 0, len(setting.Schedules))
	for _, sc := range setting.Schedules {
		exprs = append(exprs, sc.CronExpression)
	}
	s.state.SetSchedules(exprs)
	s.telemetry.SetWorkloadContext(map[string]any{"schedules": exprs})

	cycle, cancel := context.WithCancel(ctx)
	s.setCycle(cancel)
	if s.restartPending() {
		// RequestRestart arrived while GetSetting was in flight (e.g. credentials cleared): do not arm the jobs
		cancel()
	}
	defer func() {
		s.setCycle(nil)
		cancel()
	}()
	var wg sync.WaitGroup
	for _, sc := range setting.Schedules {
		s.logger.Infof("SCHEDULING JOB AT %s", sc.CronExpression)
		schedule, err := ParseCron(sc.CronExpression)
		if err != nil {
			s.logger.Errorf("INVALID CRON EXPRESSION: %s", sc.CronExpression)
			continue
		}
		wg.Add(1)
		go func(sch cron.Schedule) {
			defer wg.Done()
			s.runJob(cycle, sch)
		}(schedule)
	}
	if s.env.Listen() && !s.ExternalListen {
		s.state.Listening = true
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.listen.RunForever(cycle)
		}()
	}

	s.updateNextRun(setting)
	defer wg.Wait()

	for {
		select {
		case <-cycle.Done():
			if ctx.Err() != nil {
				return ctx.Err()
			}
			return errors.New("SCHEDULER CYCLE CANCELLED")
		case <-time.After(60 * time.Second):
		}
		verify, err := s.api.GetSetting(cycle)
		if err != nil {
			cancel()
			return err
		}
		if core.MustJSON(verify) != snapshot {
			s.logger.Warn("SETTING CHANGED")
			cancel()
			return errSettingChanged
		}
	}
}

func (s *Scheduler) updateNextRun(setting *api.Setting) {
	var next *time.Time
	for _, sc := range setting.Schedules {
		if schedule, err := ParseCron(sc.CronExpression); err == nil {
			n := schedule.Next(time.Now())
			if next == nil || n.Before(*next) {
				next = &n
			}
		}
	}
	s.state.SetNextRun(next)
}

func (s *Scheduler) runJob(ctx context.Context, schedule cron.Schedule) {
	for ctx.Err() == nil {
		next := schedule.Next(time.Now())
		select {
		case <-ctx.Done():
			return
		case <-time.After(time.Until(next)):
		}
		if s.execute.IsRunning() {
			s.logger.Warn("EXTRACTION ALREADY RUNNING, SKIPPING SCHEDULED RUN")
			continue
		}
		if err := s.execute.Run(ctx); err != nil {
			if ctx.Err() != nil {
				return
			}
			s.state.ExecutionFinished(false, err.Error())
		} else {
			s.telemetry.SetWorkloadContext(map[string]any{"lastExecutionAt": time.Now().UTC().Format(time.RFC3339)})
			s.state.ExecutionFinished(true, "")
		}
		n := schedule.Next(time.Now())
		s.state.SetNextRun(&n)
	}
}
