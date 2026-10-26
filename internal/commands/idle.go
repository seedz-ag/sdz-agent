package commands

import (
	"sync"
	"time"
)

// IdleTimer is the idle shutdown for console sessions (port of idle-timer.service.ts, PR #158).
//
// An installed agent listens forever; a SAAS console session comes up so someone can investigate,
// and a forgotten one is an idle task holding a customer's CLIENT_ID/CLIENT_SECRET.
//
// Ping is NOT activity: the API emits one every 30 s, so resetting on it would keep a forgotten
// session alive forever. Activity means an effective command (Query, Execute, Shell, Update...);
// Response is excluded too (it is what the agent sends back, not someone on the other end).
type IdleTimer struct {
	mu           sync.Mutex
	ttl          time.Duration
	onExpire     func(idleFor time.Duration)
	now          func() time.Time
	timer        *time.Timer
	lastActivity time.Time
	stopped      bool
}

var heartbeat = map[string]bool{"Ping": true, "ListActiveClients": true, "Response": true}

// IsActivity tells whether a stream message postpones the shutdown.
func IsActivity(command string) bool { return command != "" && !heartbeat[command] }

// NewIdleTimerMinutes uses the --session-ttl value (at least one minute, like the Node agent).
func NewIdleTimerMinutes(minutes float64, onExpire func(time.Duration)) *IdleTimer {
	if minutes < 1 {
		minutes = 1
	}
	return NewIdleTimer(time.Duration(minutes*float64(time.Minute)), onExpire, nil)
}

// NewIdleTimer takes an exact duration and an optional clock (tests).
func NewIdleTimer(ttl time.Duration, onExpire func(time.Duration), now func() time.Time) *IdleTimer {
	if now == nil {
		now = time.Now
	}
	return &IdleTimer{ttl: ttl, onExpire: onExpire, now: now, lastActivity: now()}
}

func (t *IdleTimer) Start() *IdleTimer {
	t.mu.Lock()
	t.schedule()
	t.mu.Unlock()
	return t
}

// Touch is called for every stream message; only an effective command resets the clock.
func (t *IdleTimer) Touch(command string) bool {
	if !IsActivity(command) {
		return false
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.stopped {
		return false
	}
	t.lastActivity = t.now()
	t.schedule()
	return true
}

func (t *IdleTimer) Stop() {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.stopped = true
	if t.timer != nil {
		t.timer.Stop()
		t.timer = nil
	}
}

func (t *IdleTimer) IdleFor() time.Duration {
	t.mu.Lock()
	defer t.mu.Unlock()
	return t.now().Sub(t.lastActivity)
}

func (t *IdleTimer) schedule() {
	if t.stopped {
		return
	}
	if t.timer != nil {
		t.timer.Stop()
	}
	t.timer = time.AfterFunc(t.ttl, func() {
		t.mu.Lock()
		stopped := t.stopped
		t.mu.Unlock()
		if !stopped {
			t.onExpire(t.IdleFor())
		}
	})
}
