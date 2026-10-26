// Package collector hosts the telemetry Service; it lives apart from package telemetry
// because core (HTTP client) imports telemetry.Recorder and the service needs core.
package collector

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/seedz-ag/sdz-agent-go/internal/api"
	"github.com/seedz-ag/sdz-agent-go/internal/core"
	"github.com/seedz-ag/sdz-agent-go/internal/telemetry"
)

type (
	Stat     = telemetry.Stat
	MemStat  = telemetry.MemStat
	Network  = telemetry.Network
	Recorder = telemetry.Recorder
	Outbox   = telemetry.Outbox
	Sampler  = telemetry.Sampler
)

type SystemMetrics = telemetry.SystemMetrics

// NewOutbox places the WAL at <OutputDir>/telemetry-outbox.jsonl.
func NewOutbox(paths *core.Paths) *Outbox {
	return telemetry.NewOutboxAt(filepath.Join(paths.OutputDir(), "telemetry-outbox.jsonl"), telemetry.DefaultMaxLines)
}

const WindowSeconds = 60

type AgentInfo struct {
	Name    string `json:"name"`
	Version string `json:"version"`
	Mode    string `json:"mode"`
}

type HostInfo struct {
	Hostname         string   `json:"hostname"`
	OS               string   `json:"os"`
	OSVersion        string   `json:"osVersion"`
	Arch             string   `json:"arch"`
	Timezone         string   `json:"timezone"`
	UTCOffsetMinutes int      `json:"utcOffsetMinutes"`
	ClockDriftMs     *float64 `json:"clockDriftMs"`
}

type RuntimeInfo struct {
	StartedAt string `json:"startedAt"`
	UptimeSec int64  `json:"uptimeSec"`
}

type Resources struct {
	CPUCount       int     `json:"cpuCount"`
	CPUPercent     Stat    `json:"cpuPercent"`
	MemTotalBytes  uint64  `json:"memTotalBytes"`
	MemFreeBytes   MemStat `json:"memFreeBytes"`
	DiskTotalBytes uint64  `json:"diskTotalBytes"`
	DiskFreeBytes  uint64  `json:"diskFreeBytes"`
}

type Payload struct {
	SchemaVersion int            `json:"schemaVersion"`
	Agent         AgentInfo      `json:"agent"`
	Host          HostInfo       `json:"host"`
	Runtime       RuntimeInfo    `json:"runtime"`
	WindowSeconds int            `json:"windowSeconds"`
	Resources     Resources      `json:"resources"`
	Network       Network        `json:"network"`
	Workload      map[string]any `json:"workload"`
	CollectedAt   string         `json:"collectedAt"`
}

// Service collects a windowed system+network snapshot every 60 s, appends it to
// the WAL and best-effort ships the outstanding entries (port of TelemetryService).
type Service struct {
	env      *core.Env
	paths    *core.Paths
	http     *core.HTTPClient
	logger   *core.Logger
	recorder *Recorder
	outbox   *Outbox
	sampler  *Sampler
	metrics  *SystemMetrics

	mu        sync.Mutex
	mode      string
	startedAt time.Time
	workload  map[string]any
	drift     *float64
	stop      chan struct{}
	running   bool
	shipping  bool

	// Now and PostRaw are substitutable in tests.
	Now     func() time.Time
	PostRaw func(ctx context.Context, url string, payload any, headers map[string]string, timeout int) (http.Header, error)
}

func New(env *core.Env, paths *core.Paths, httpc *core.HTTPClient, logger *core.Logger, recorder *Recorder, outbox *Outbox, sampler *Sampler, metrics *SystemMetrics) *Service {
	s := &Service{env: env, paths: paths, http: httpc, logger: logger, recorder: recorder, outbox: outbox, sampler: sampler, metrics: metrics,
		mode: "scheduler", startedAt: time.Now(), workload: map[string]any{}, Now: time.Now}
	s.PostRaw = func(ctx context.Context, url string, payload any, headers map[string]string, timeout int) (http.Header, error) {
		resp, err := httpc.Post(ctx, url, payload, headers, timeout)
		if err != nil {
			return nil, err
		}
		return resp.Header, nil
	}
	return s
}

func (s *Service) IsEnabled() bool { return s.env.TelemetryEnabled() }

func (s *Service) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

// Start is idempotent: the first caller's mode sticks (scheduler also runs listen).
func (s *Service) Start(mode string) {
	if !s.IsEnabled() {
		return
	}
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.mode = mode
	s.startedAt = s.Now()
	s.stop = make(chan struct{})
	stop := s.stop
	s.mu.Unlock()
	s.recorder.Reset()
	s.sampler.Start()
	go func() {
		t := time.NewTicker(WindowSeconds * time.Second)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				_ = s.CollectAndShip(context.Background())
			}
		}
	}()
}

func (s *Service) Stop() {
	s.sampler.Stop()
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	close(s.stop)
	s.running = false
}

func (s *Service) SetWorkloadContext(patch map[string]any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for k, v := range patch {
		s.workload[k] = v
	}
}

func (s *Service) CollectAndShip(ctx context.Context) error {
	func() {
		defer func() {
			if r := recover(); r != nil {
				s.logger.Error("TELEMETRY COLLECT FAILED", r)
			}
		}()
		if err := s.outbox.Append([]any{s.buildPayload()}); err != nil {
			s.logger.Error("TELEMETRY COLLECT FAILED", err.Error())
		}
	}()
	return s.ship(ctx)
}

// BuildPayload is exported for tests.
func (s *Service) BuildPayload() Payload { return s.buildPayload() }

func (s *Service) buildPayload() Payload {
	snap := s.sampler.Snapshot()
	network := s.recorder.Snapshot()
	diskStats := s.metrics.DiskStats(s.paths.DataDir)
	s.mu.Lock()
	mode, startedAt, drift := s.mode, s.startedAt, s.drift
	workload := map[string]any{}
	for k, v := range s.workload {
		workload[k] = v
	}
	s.mu.Unlock()
	now := s.Now()
	workload["listen"] = mode == "listen" || s.env.Listen()
	files, bytes := s.outputBacklog()
	workload["outputBacklog"] = map[string]any{"files": files, "bytes": bytes}
	return Payload{
		SchemaVersion: 1,
		Agent:         AgentInfo{Name: core.AgentName, Version: core.Version, Mode: mode},
		Host: HostInfo{Hostname: s.metrics.Hostname(), OS: s.metrics.OSName(), OSVersion: s.metrics.OSVersion(), Arch: s.metrics.Arch(),
			Timezone: s.metrics.Timezone(), UTCOffsetMinutes: s.metrics.UTCOffsetMinutes(), ClockDriftMs: drift},
		Runtime:       RuntimeInfo{StartedAt: startedAt.UTC().Format(time.RFC3339Nano), UptimeSec: int64(now.Sub(startedAt).Seconds())},
		WindowSeconds: WindowSeconds,
		Resources: Resources{CPUCount: s.metrics.CPUCount(), CPUPercent: snap.CPUPercent, MemTotalBytes: s.metrics.MemTotalBytes(),
			MemFreeBytes: snap.MemFreeBytes, DiskTotalBytes: diskStats.TotalBytes, DiskFreeBytes: diskStats.FreeBytes},
		Network:     network,
		Workload:    workload,
		CollectedAt: now.UTC().Format(time.RFC3339Nano),
	}
}

func (s *Service) outputBacklog() (int, int64) {
	entries, err := os.ReadDir(s.paths.OutputDir())
	if err != nil {
		return 0, 0
	}
	files, bytes := 0, int64(0)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), ".") || filepath.Join(s.paths.OutputDir(), e.Name()) == s.outbox.Path() {
			continue
		}
		files++
		if info, err := e.Info(); err == nil {
			bytes += info.Size()
		}
	}
	return files, bytes
}

func (s *Service) ship(ctx context.Context) error {
	s.mu.Lock()
	if s.shipping {
		s.mu.Unlock()
		return nil
	}
	s.shipping = true
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.shipping = false
		s.mu.Unlock()
	}()

	lines := s.outbox.ReadAll()
	if len(lines) == 0 {
		return nil
	}
	batch := make([]json.RawMessage, 0, len(lines))
	for _, l := range lines {
		batch = append(batch, json.RawMessage(l))
	}
	headers := map[string]string{
		"Authorization":  api.BasicAuth(s.env.ClientID(), s.env.ClientSecret()),
		"sdz-request-id": uuid.NewString(),
	}
	sentAt := s.Now()
	respHeaders, err := s.PostRaw(ctx, s.env.APIURL()+"telemetry", batch, headers, s.env.APIRequestTimeout())
	if err != nil {
		s.logger.Warn("TELEMETRY SHIP FAILED, KEEPING OUTBOX FOR RETRY", err.Error())
		return err
	}
	s.updateClockDrift(respHeaders, sentAt)
	return s.outbox.RemoveFirst(len(lines))
}

func (s *Service) updateClockDrift(h http.Header, sentAt time.Time) {
	if h == nil {
		return
	}
	serverDate, err := http.ParseTime(h.Get("Date"))
	if err != nil {
		return
	}
	drift := float64(sentAt.Sub(serverDate).Milliseconds())
	s.mu.Lock()
	s.drift = &drift
	s.mu.Unlock()
}
