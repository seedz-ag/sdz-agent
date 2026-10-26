package control

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/state"
)

func TestProtocolFieldNames(t *testing.T) {
	b, _ := json.Marshal(ControlRequest{Op: "configure", ClientID: "a", ClientSecret: "b", APIURL: "c", Lines: 5})
	for _, k := range []string{`"Op"`, `"ClientId"`, `"ClientSecret"`, `"ApiUrl"`, `"Lines"`} {
		if !strings.Contains(string(b), k) {
			t.Fatalf("missing %s in %s", k, b)
		}
	}
	st := state.Status{Version: "1"}
	rb, _ := json.Marshal(ControlResponse{Ok: true, Message: "m", Status: &st, Logs: []string{"x"}})
	for _, k := range []string{`"Ok"`, `"Message"`, `"Status"`, `"Logs"`, `"Version"`, `"Configured"`, `"DataDir"`, `"Schedules"`, `"AuthOk"`, `"StartedAt"`, `"LastExecutionOk"`, `"NextRunAt"`} {
		if !strings.Contains(string(rb), k) {
			t.Fatalf("missing %s in %s", k, rb)
		}
	}
}

func TestUnixRoundTrip(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("unix socket test")
	}
	sock := filepath.Join(os.TempDir(), "sdz-ctl-test.sock")
	t.Setenv(EnvironmentVariable, sock)
	dir := t.TempDir()
	paths := core.NewPathsAt(dir)
	_ = os.MkdirAll(paths.LogsDir(), 0o750)
	_ = os.WriteFile(filepath.Join(paths.LogsDir(), "agent-2026-10-21.log"), []byte(`["info","2026-10-21 10:00:00","HELLO","WORLD"]`+"\n"), 0o640)
	env, _ := core.NewEnv(paths, true)
	st := state.New(env, paths)
	configured := false
	srv := NewServer(env, paths, core.NewLogger(), Handlers{
		Status:    func() state.Status { s := st.Snapshot(); s.Configured = configured; return s },
		IsRunning: func() bool { return false },
		Run:       func(context.Context) error { return nil },
		Logs:      func(n int) []string { return TailLogs(paths, n) },
		ClearLogs: func() (int, error) { return ClearLogs(paths) },
		Configure: func(_ context.Context, id, secret, url string) error {
			if secret != "good" {
				return ErrInvalidCredentials
			}
			configured = true
			return nil
		},
	})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = srv.Serve(ctx) }()
	deadline := time.Now().Add(5 * time.Second)
	for {
		if _, err := os.Stat(sock); err == nil || time.Now().After(deadline) {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	c := NewClient()
	if r, err := c.Ping(ctx); err != nil || r.Message != "pong" {
		t.Fatalf("ping %+v %v", r, err)
	}
	if r, _ := c.Run(ctx); r.Ok || r.Message != "AGENT NOT CONFIGURED" {
		t.Fatalf("run unconfigured %+v", r)
	}
	if r, _ := c.Configure(ctx, "id", "bad", ""); r.Ok || r.Message != "INVALID CREDENTIALS" {
		t.Fatalf("bad creds %+v", r)
	}
	if r, _ := c.Configure(ctx, "id", "good", "https://api.test/v1"); !r.Ok || r.Message != "CONFIGURATION SAVED" {
		t.Fatalf("good creds %+v", r)
	}
	if r, _ := c.Send(ctx, ControlRequest{Op: "configure"}); r.Message != "CLIENT ID AND CLIENT SECRET ARE REQUIRED" {
		t.Fatalf("missing creds %+v", r)
	}
	if r, _ := c.Logs(ctx, 10); !r.Ok || len(r.Logs) != 1 || !strings.Contains(r.Logs[0], "HELLO WORLD") {
		t.Fatalf("logs %+v", r)
	}
	if r, _ := c.ClearLogs(ctx); !r.Ok || r.Message != "1 ARQUIVO(S) DE LOG REMOVIDO(S)" {
		t.Fatalf("clear %+v", r)
	}
	if r, _ := c.Send(ctx, ControlRequest{Op: "nope"}); r.Message != "UNKNOWN OPERATION 'nope'" {
		t.Fatalf("unknown %+v", r)
	}
	if r, _ := c.Status(ctx); !r.Ok || r.Status == nil || !r.Status.Configured {
		t.Fatalf("status %+v", r)
	}
	cancel()
	time.Sleep(100 * time.Millisecond)
	if _, err := c.Ping(context.Background()); err == nil || !errors.Is(err, errNoService) && !strings.Contains(err.Error(), "not running") {
		t.Logf("after shutdown: %v", err)
	}
}

func TestServerSocketPathFallbacks(t *testing.T) {
	t.Setenv(EnvironmentVariable, "")
	long := strings.Repeat("x", 120)
	if got := ServerSocketPath(filepath.Join(os.TempDir(), long)); got != FallbackSocketPath() && !strings.HasSuffix(got, "control.sock") {
		t.Fatalf("got %s", got)
	}
	t.Setenv(EnvironmentVariable, "/tmp/custom.sock")
	if ServerSocketPath("/x") != "/tmp/custom.sock" || ClientSocketCandidates()[0] != "/tmp/custom.sock" {
		t.Fatal("env override")
	}
}
