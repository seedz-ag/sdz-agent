package commands

import (
	"sync/atomic"
	"testing"
	"time"
)

func TestIsActivity(t *testing.T) {
	for cmd, want := range map[string]bool{"Ping": false, "ListActiveClients": false, "Response": false, "": false, "Query": true, "Execute": true, "Shell": true, "Update": true} {
		if got := IsActivity(cmd); got != want {
			t.Errorf("IsActivity(%q) = %v, want %v", cmd, got, want)
		}
	}
}

func TestIdleTimerExpires(t *testing.T) {
	done := make(chan time.Duration, 1)
	tm := NewIdleTimer(150*time.Millisecond, func(d time.Duration) { done <- d }, nil).Start()
	defer tm.Stop()
	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("did not expire")
	}
}

func TestPingsDoNotPostponeButCommandsDo(t *testing.T) {
	var fired int32
	tm := NewIdleTimer(400*time.Millisecond, func(time.Duration) { atomic.AddInt32(&fired, 1) }, nil).Start()
	defer tm.Stop()
	for i := 0; i < 6; i++ {
		if tm.Touch("Ping") {
			t.Fatal("Ping must not count as activity")
		}
		time.Sleep(100 * time.Millisecond)
	}
	if atomic.LoadInt32(&fired) != 1 {
		t.Fatalf("pings must not keep the session alive (fired=%d)", fired)
	}

	var fired2 int32
	tm2 := NewIdleTimer(400*time.Millisecond, func(time.Duration) { atomic.AddInt32(&fired2, 1) }, nil).Start()
	defer tm2.Stop()
	for i := 0; i < 5; i++ {
		if !tm2.Touch("Query") {
			t.Fatal("Query must count as activity")
		}
		time.Sleep(200 * time.Millisecond)
	}
	if atomic.LoadInt32(&fired2) != 0 {
		t.Fatal("effective commands must keep the session alive")
	}
}

func TestIdleTimerStop(t *testing.T) {
	var fired int32
	tm := NewIdleTimer(100*time.Millisecond, func(time.Duration) { atomic.AddInt32(&fired, 1) }, nil).Start()
	tm.Stop()
	time.Sleep(300 * time.Millisecond)
	if atomic.LoadInt32(&fired) != 0 || tm.Touch("Query") {
		t.Fatal("stopped timer must not fire nor accept activity")
	}
}
