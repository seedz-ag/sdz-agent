package telemetry

import (
	"sync"
	"time"
)

const SampleInterval = time.Second

type SamplerSnapshot struct {
	CPUPercent   Stat
	MemFreeBytes MemStat
}

// Sampler ticks every second accumulating CPU% and available-memory samples for the current window.
type Sampler struct {
	metrics *SystemMetrics
	mu      sync.Mutex
	prev    *CPUTimes
	cpu     []float64
	mem     []float64
	stop    chan struct{}
	running bool
}

func NewSampler(metrics *SystemMetrics) *Sampler { return &Sampler{metrics: metrics} }

func (s *Sampler) Start() {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return
	}
	s.running = true
	s.stop = make(chan struct{})
	p := s.metrics.SampleCPUTimes()
	s.prev = &p
	stop := s.stop
	s.mu.Unlock()
	go func() {
		t := time.NewTicker(SampleInterval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				s.Tick()
			}
		}
	}()
}

func (s *Sampler) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	close(s.stop)
	s.running = false
}

func (s *Sampler) Tick() {
	cur := s.metrics.SampleCPUTimes()
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.prev != nil {
		s.cpu = append(s.cpu, s.metrics.CPUPercentBetween(*s.prev, cur))
	}
	s.prev = &cur
	s.mem = append(s.mem, float64(s.metrics.MemFreeBytes()))
}

func (s *Sampler) Snapshot() SamplerSnapshot {
	s.mu.Lock()
	defer s.mu.Unlock()
	snap := SamplerSnapshot{CPUPercent: AggregateAvgMaxP95(s.cpu), MemFreeBytes: AggregateAvgMinP95(s.mem)}
	s.cpu, s.mem = nil, nil
	return snap
}
