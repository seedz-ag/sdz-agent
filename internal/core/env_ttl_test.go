package core

import "testing"

func TestSessionTTLIsGarbageTolerant(t *testing.T) {
	for raw, want := range map[string]float64{"30": 30, "0.5": 0.5, "0": 0, "-5": 0, "abc": 0, "": 0, "Inf": 0} {
		e, _ := NewEnv(NewPathsAt(t.TempDir()), true)
		_ = e.Merge(map[string]string{"session-ttl": raw})
		if got := e.SessionTTLMinutes(); got != want {
			t.Errorf("SESSION_TTL=%q -> %v, want %v", raw, got, want)
		}
	}
}
