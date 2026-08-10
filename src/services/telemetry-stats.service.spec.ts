import "reflect-metadata";
import { TelemetryStatsService } from "./telemetry-stats.service";

describe("TelemetryStatsService", () => {
  let service: TelemetryStatsService;

  beforeEach(() => {
    service = new TelemetryStatsService();
  });

  describe("average/max/min", () => {
    it("returns 0 for empty samples", () => {
      expect(service.average([])).toBe(0);
      expect(service.max([])).toBe(0);
      expect(service.min([])).toBe(0);
    });

    it("computes average, max and min over a sample window", () => {
      const samples = [10, 20, 30, 40];
      expect(service.average(samples)).toBe(25);
      expect(service.max(samples)).toBe(40);
      expect(service.min(samples)).toBe(10);
    });
  });

  describe("percentile", () => {
    it("returns 0 for an empty sample window", () => {
      expect(service.percentile([], 95)).toBe(0);
    });

    it("returns the single value when there is only one sample", () => {
      expect(service.percentile([42], 95)).toBe(42);
    });

    it("linearly interpolates p95 across a sorted sample window", () => {
      const samples = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      // rank = 0.95 * (10 - 1) = 8.55 -> interpolate between sorted[8]=9 and sorted[9]=10
      expect(service.percentile(samples, 95)).toBeCloseTo(9.55, 5);
    });

    it("is insensitive to input order", () => {
      const ordered = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const shuffled = [7, 2, 10, 4, 1, 9, 3, 6, 8, 5];
      expect(service.percentile(shuffled, 95)).toBeCloseTo(
        service.percentile(ordered, 95),
        5
      );
    });
  });

  describe("aggregation helpers", () => {
    it("aggregates avg/max/p95 (cpu-style peaks)", () => {
      const aggregate = service.aggregateAvgMaxP95([10, 20, 30, 40, 50]);
      expect(aggregate.avg).toBe(30);
      expect(aggregate.max).toBe(50);
      expect(aggregate.p95).toBeGreaterThanOrEqual(aggregate.avg);
    });

    it("aggregates avg/min/p95 (mem-style peaks, min = peak usage)", () => {
      const aggregate = service.aggregateAvgMinP95([100, 200, 300, 400, 500]);
      expect(aggregate.avg).toBe(300);
      expect(aggregate.min).toBe(100);
      expect(aggregate.p95).toBeGreaterThanOrEqual(aggregate.avg);
    });
  });
});
