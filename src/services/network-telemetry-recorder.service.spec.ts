import "reflect-metadata";
import { NetworkTelemetryRecorderService } from "./network-telemetry-recorder.service";
import { TelemetryStatsService } from "./telemetry-stats.service";

describe("NetworkTelemetryRecorderService", () => {
  let recorder: NetworkTelemetryRecorderService;

  beforeEach(() => {
    recorder = new NetworkTelemetryRecorderService(new TelemetryStatsService());
  });

  it("starts with an empty window", () => {
    const snapshot = recorder.snapshot();
    expect(snapshot).toEqual({
      requests: 0,
      errors: 0,
      timeouts: 0,
      retries: 0,
      latencyMs: { avg: 0, max: 0, p95: 0 },
    });
  });

  it("counts requests by outcome and aggregates latency", () => {
    recorder.recordRequest("ok", 10);
    recorder.recordRequest("ok", 20);
    recorder.recordRequest("error", 30);
    recorder.recordRequest("timeout", 40);
    recorder.recordRetry();
    recorder.recordRetry();

    const snapshot = recorder.snapshot();
    expect(snapshot.requests).toBe(4);
    expect(snapshot.errors).toBe(1);
    expect(snapshot.timeouts).toBe(1);
    expect(snapshot.retries).toBe(2);
    expect(snapshot.latencyMs.avg).toBeCloseTo(25, 5);
    expect(snapshot.latencyMs.max).toBe(40);
  });

  it("resets the window after a snapshot is taken", () => {
    recorder.recordRequest("ok", 100);
    recorder.recordRetry();
    recorder.snapshot();

    const next = recorder.snapshot();
    expect(next).toEqual({
      requests: 0,
      errors: 0,
      timeouts: 0,
      retries: 0,
      latencyMs: { avg: 0, max: 0, p95: 0 },
    });
  });

  it("clamps negative latencies to 0", () => {
    recorder.recordRequest("ok", -5);
    const snapshot = recorder.snapshot();
    expect(snapshot.latencyMs.avg).toBe(0);
  });
});
