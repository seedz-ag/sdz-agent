package telemetry

import (
	"math"
	"sort"
	"sync"
)

type Outcome int

const (
	OutcomeOK Outcome = iota
	OutcomeError
	OutcomeTimeout
)

type Stat struct {
	Avg float64 `json:"avg"`
	Max float64 `json:"max"`
	P95 float64 `json:"p95"`
}

type MemStat struct {
	Avg float64 `json:"avg"`
	Min float64 `json:"min"`
	P95 float64 `json:"p95"`
}

type Network struct {
	Requests  int  `json:"requests"`
	Errors    int  `json:"errors"`
	Timeouts  int  `json:"timeouts"`
	Retries   int  `json:"retries"`
	LatencyMs Stat `json:"latencyMs"`
}

func Average(v []float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range v {
		s += x
	}
	return s / float64(len(v))
}

func Max(v []float64) float64 {
	m := 0.0
	for i, x := range v {
		if i == 0 || x > m {
			m = x
		}
	}
	return m
}

func Min(v []float64) float64 {
	m := 0.0
	for i, x := range v {
		if i == 0 || x < m {
			m = x
		}
	}
	return m
}

// Percentile uses linear interpolation (R-7), like the Node implementation.
func Percentile(v []float64, p float64) float64 {
	if len(v) == 0 {
		return 0
	}
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	if len(s) == 1 {
		return s[0]
	}
	rank := (p / 100) * float64(len(s)-1)
	lower := int(math.Floor(rank))
	upper := int(math.Ceil(rank))
	if lower == upper {
		return s[lower]
	}
	w := rank - float64(lower)
	return s[lower] + (s[upper]-s[lower])*w
}

func AggregateAvgMaxP95(v []float64) Stat    { return Stat{Avg: Average(v), Max: Max(v), P95: Percentile(v, 95)} }
func AggregateAvgMinP95(v []float64) MemStat { return MemStat{Avg: Average(v), Min: Min(v), P95: Percentile(v, 95)} }

// Recorder passively observes the agent's HTTP traffic (port of NetworkTelemetryRecorderService).
type Recorder struct {
	mu        sync.Mutex
	requests  int
	errors    int
	timeouts  int
	retries   int
	latencies []float64
}

func NewRecorder() *Recorder { return &Recorder{} }

func (r *Recorder) RecordRequest(outcome Outcome, latencyMs float64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.requests++
	r.latencies = append(r.latencies, math.Max(0, latencyMs))
	switch outcome {
	case OutcomeTimeout:
		r.timeouts++
	case OutcomeError:
		r.errors++
	}
}

func (r *Recorder) RecordRetry() {
	r.mu.Lock()
	r.retries++
	r.mu.Unlock()
}

func (r *Recorder) Snapshot() Network {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := Network{Requests: r.requests, Errors: r.errors, Timeouts: r.timeouts, Retries: r.retries, LatencyMs: AggregateAvgMaxP95(r.latencies)}
	r.requests, r.errors, r.timeouts, r.retries, r.latencies = 0, 0, 0, 0, nil
	return n
}

func (r *Recorder) Reset() { r.Snapshot() }
