// Package state holds the live status shared by scheduler, execute and the control channel.
package state

import (
	"sync"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
)

type Status struct {
	Version         string     `json:"Version"`
	Configured      bool       `json:"Configured"`
	ClientID        string     `json:"ClientId,omitempty"`
	ClientSecret    string     `json:"ClientSecret,omitempty"`
	APIURL          string     `json:"ApiUrl,omitempty"`
	DataDir         string     `json:"DataDir"`
	Running         bool       `json:"Running"`
	Listening       bool       `json:"Listening"`
	StartedAt       time.Time  `json:"StartedAt"`
	LastExecutionAt *time.Time `json:"LastExecutionAt"`
	LastExecutionOK *bool      `json:"LastExecutionOk"`
	NextRunAt       *time.Time `json:"NextRunAt"`
	Schedules       []string   `json:"Schedules"`
	LastError       string     `json:"LastError,omitempty"`
	AuthOK          bool       `json:"AuthOk"`
}

type State struct {
	mu        sync.Mutex
	env       *core.Env
	paths     *core.Paths
	startedAt time.Time
	lastExec  *time.Time
	lastOK    *bool
	nextRun   *time.Time
	schedules []string
	lastError string
	Listening bool
	AuthOK    bool
	Running   bool
}

func New(env *core.Env, paths *core.Paths) *State {
	return &State{env: env, paths: paths, startedAt: time.Now()}
}

func (s *State) ExecutionFinished(ok bool, err string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	t := time.Now()
	s.lastExec = &t
	s.lastOK = &ok
	if ok {
		s.lastError = ""
	} else {
		s.lastError = err
	}
}

func (s *State) SetSchedules(v []string) {
	s.mu.Lock()
	s.schedules = append([]string(nil), v...)
	s.mu.Unlock()
}

func (s *State) SetNextRun(t *time.Time) {
	s.mu.Lock()
	s.nextRun = t
	s.mu.Unlock()
}

func (s *State) SetError(err string) {
	s.mu.Lock()
	s.lastError = err
	s.mu.Unlock()
}

func (s *State) Snapshot() Status {
	s.mu.Lock()
	defer s.mu.Unlock()
	return Status{
		Version:         core.Version,
		Configured:      s.env.Configured(),
		ClientID:        s.env.ClientID(),
		ClientSecret:    s.env.ClientSecret(),
		APIURL:          s.env.GetOrEmpty("API_URL"),
		DataDir:         s.paths.DataDir,
		Running:         s.Running,
		Listening:       s.Listening,
		StartedAt:       s.startedAt,
		LastExecutionAt: s.lastExec,
		LastExecutionOK: s.lastOK,
		NextRunAt:       s.nextRun,
		Schedules:       append([]string(nil), s.schedules...),
		LastError:       s.lastError,
		AuthOK:          s.AuthOK,
	}
}
