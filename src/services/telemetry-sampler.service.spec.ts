import "reflect-metadata";
import { SystemMetricsAdapter } from "../adapters/system-metrics.adapter";
import { TelemetrySamplerService } from "./telemetry-sampler.service";
import { TelemetryStatsService } from "./telemetry-stats.service";

describe("TelemetrySamplerService", () => {
  let systemMetricsAdapter: jest.Mocked<Pick<SystemMetricsAdapter, "sampleCpuTimes" | "cpuPercentBetween" | "getMemFreeBytes">>;
  let sampler: TelemetrySamplerService;

  beforeEach(() => {
    systemMetricsAdapter = {
      sampleCpuTimes: jest.fn(),
      cpuPercentBetween: jest.fn(),
      getMemFreeBytes: jest.fn(),
    };
    sampler = new TelemetrySamplerService(
      systemMetricsAdapter as unknown as SystemMetricsAdapter,
      new TelemetryStatsService()
    );
  });

  afterEach(() => {
    sampler.stop();
  });

  it("returns zeroed aggregates when no ticks happened yet", () => {
    const snapshot = sampler.snapshot();
    expect(snapshot.cpuPercent).toEqual({ avg: 0, max: 0, p95: 0 });
    expect(snapshot.memFreeBytes).toEqual({ avg: 0, min: 0, p95: 0 });
  });

  it("accumulates cpu% (via delta) and mem-free samples across ticks, then aggregates avg/max/p95", () => {
    const cpuTimesSequence = [
      { idle: 0, total: 0 },
      { idle: 10, total: 100 },
      { idle: 30, total: 200 },
      { idle: 60, total: 300 },
    ];
    let call = 0;
    systemMetricsAdapter.sampleCpuTimes.mockImplementation(() => cpuTimesSequence[call++]);
    systemMetricsAdapter.cpuPercentBetween.mockImplementation((prev, curr) => {
      const idleDelta = curr.idle - prev.idle;
      const totalDelta = curr.total - prev.total;
      return totalDelta > 0 ? (1 - idleDelta / totalDelta) * 100 : 0;
    });
    systemMetricsAdapter.getMemFreeBytes
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(500)
      .mockReturnValueOnce(800);

    sampler.start(); // consumes cpuTimesSequence[0] as the baseline
    sampler.tick(); // uses cpuTimesSequence[1] -> 90% busy, mem=1000
    sampler.tick(); // uses cpuTimesSequence[2] -> 80% busy, mem=500
    sampler.tick(); // uses cpuTimesSequence[3] -> 70% busy, mem=800

    const snapshot = sampler.snapshot();
    expect(snapshot.cpuPercent.avg).toBeCloseTo(80, 5);
    expect(snapshot.cpuPercent.max).toBeCloseTo(90, 5);
    expect(snapshot.memFreeBytes.avg).toBeCloseTo((1000 + 500 + 800) / 3, 5);
    // min = the lowest available memory sample = the peak of memory usage
    expect(snapshot.memFreeBytes.min).toBe(500);
  });

  it("resets the sample window after snapshot()", () => {
    systemMetricsAdapter.sampleCpuTimes.mockReturnValue({ idle: 0, total: 0 });
    systemMetricsAdapter.cpuPercentBetween.mockReturnValue(50);
    systemMetricsAdapter.getMemFreeBytes.mockReturnValue(42);

    sampler.start();
    sampler.tick();
    sampler.snapshot();

    const next = sampler.snapshot();
    expect(next.cpuPercent).toEqual({ avg: 0, max: 0, p95: 0 });
    expect(next.memFreeBytes).toEqual({ avg: 0, min: 0, p95: 0 });
  });

  it("start() is idempotent (a second call doesn't reset the baseline/timer)", () => {
    sampler.start();
    sampler.start();
    expect(systemMetricsAdapter.sampleCpuTimes).toHaveBeenCalledTimes(1);
  });
});
