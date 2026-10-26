package telemetry

import "testing"

func TestPercentileLinearInterpolation(t *testing.T) {
	v := []float64{10, 20, 30, 40}
	if got := Percentile(v, 95); got < 38.4 || got > 38.6 {
		t.Fatalf("p95 = %v", got)
	}
	if Percentile(nil, 95) != 0 || Percentile([]float64{7}, 95) != 7 {
		t.Fatal("edge cases")
	}
	s := AggregateAvgMaxP95([]float64{1, 2, 3})
	if s.Avg != 2 || s.Max != 3 {
		t.Fatalf("stat %+v", s)
	}
	m := AggregateAvgMinP95([]float64{5, 3, 9})
	if m.Min != 3 {
		t.Fatalf("memstat %+v", m)
	}
}

func TestRecorderSnapshotResets(t *testing.T) {
	r := NewRecorder()
	r.RecordRequest(OutcomeOK, 10)
	r.RecordRequest(OutcomeError, 20)
	r.RecordRequest(OutcomeTimeout, -5)
	r.RecordRetry()
	n := r.Snapshot()
	if n.Requests != 3 || n.Errors != 1 || n.Timeouts != 1 || n.Retries != 1 || n.LatencyMs.Max != 20 || n.LatencyMs.Avg != 10 {
		t.Fatalf("network %+v", n)
	}
	if again := r.Snapshot(); again.Requests != 0 || again.LatencyMs.Max != 0 {
		t.Fatalf("not reset: %+v", again)
	}
}

func TestSamplerSnapshotResets(t *testing.T) {
	s := NewSampler(NewSystemMetrics())
	s.Tick()
	s.Tick()
	snap := s.Snapshot()
	if snap.MemFreeBytes.Avg <= 0 {
		t.Fatalf("expected memory samples, got %+v", snap)
	}
	if again := s.Snapshot(); again.MemFreeBytes.Avg != 0 {
		t.Fatal("snapshot did not reset")
	}
}
