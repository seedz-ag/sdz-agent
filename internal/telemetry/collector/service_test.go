package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry"
)

func newService(t *testing.T) (*Service, *core.Paths) {
	t.Helper()
	dir := t.TempDir()
	paths := core.NewPathsAt(dir)
	_ = os.WriteFile(paths.EnvFile(), []byte("API_URL=https://api.test/v1/\nCLIENT_ID=id\nCLIENT_SECRET=secret\n"), 0o600)
	env, err := core.NewEnv(paths, false)
	if err != nil {
		t.Fatal(err)
	}
	logger := core.NewLogger()
	rec := telemetry.NewRecorder()
	metrics := telemetry.NewSystemMetrics()
	s := New(env, paths, core.NewHTTPClient(rec), logger, rec, NewOutbox(paths), telemetry.NewSampler(metrics), metrics)
	return s, paths
}

func TestPayloadShape(t *testing.T) {
	s, _ := newService(t)
	s.SetWorkloadContext(map[string]any{"schedules": []string{"0 6 * * *"}})
	b, err := json.Marshal(s.BuildPayload())
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	for _, k := range []string{"schemaVersion", "agent", "host", "runtime", "windowSeconds", "resources", "network", "workload", "collectedAt"} {
		if _, ok := m[k]; !ok {
			t.Fatalf("missing %s in %s", k, b)
		}
	}
	host := m["host"].(map[string]any)
	if v, ok := host["clockDriftMs"]; !ok || v != nil {
		t.Fatalf("clockDriftMs must be null before first ship: %v", host)
	}
	if m["agent"].(map[string]any)["name"] != "sdz-agent" || m["windowSeconds"].(float64) != 60 {
		t.Fatalf("agent/window: %s", b)
	}
	wl := m["workload"].(map[string]any)
	if _, ok := wl["outputBacklog"]; !ok || wl["listen"] != false {
		t.Fatalf("workload: %v", wl)
	}
	if _, ok := wl["schedules"]; !ok {
		t.Fatal("workload context lost")
	}
}

func TestShipFailureKeepsWAL(t *testing.T) {
	s, paths := newService(t)
	s.PostRaw = func(context.Context, string, any, map[string]string, int) (http.Header, error) {
		return nil, context.DeadlineExceeded
	}
	if err := s.CollectAndShip(context.Background()); err == nil {
		t.Fatal("expected ship error")
	}
	if _, err := os.Stat(filepath.Join(paths.OutputDir(), "telemetry-outbox.jsonl")); err != nil {
		t.Fatal("WAL missing")
	}
	if n := len(NewOutbox(paths).ReadAll()); n != 1 {
		t.Fatalf("WAL lines = %d", n)
	}
}

func TestShipSuccessDrainsAndSetsDrift(t *testing.T) {
	s, paths := newService(t)
	var gotAuth string
	var gotBatch []json.RawMessage
	serverDate := time.Now().Add(-90 * time.Second)
	s.PostRaw = func(_ context.Context, url string, payload any, headers map[string]string, _ int) (http.Header, error) {
		gotAuth = headers["Authorization"]
		gotBatch = payload.([]json.RawMessage)
		h := http.Header{}
		h.Set("Date", serverDate.UTC().Format(http.TimeFormat))
		return h, nil
	}
	if err := s.CollectAndShip(context.Background()); err != nil {
		t.Fatal(err)
	}
	if gotAuth == "" || len(gotBatch) != 1 {
		t.Fatalf("auth=%q batch=%d", gotAuth, len(gotBatch))
	}
	if n := len(NewOutbox(paths).ReadAll()); n != 0 {
		t.Fatalf("WAL not drained: %d", n)
	}
	p := s.BuildPayload()
	if p.Host.ClockDriftMs == nil || *p.Host.ClockDriftMs < 80_000 {
		t.Fatalf("drift %v", p.Host.ClockDriftMs)
	}
}

func TestStartIsIdempotent(t *testing.T) {
	s, _ := newService(t)
	s.Start("scheduler")
	s.Start("listen")
	defer s.Stop()
	if !s.IsRunning() || s.BuildPayload().Agent.Mode != "scheduler" {
		t.Fatal("first mode must stick")
	}
}
