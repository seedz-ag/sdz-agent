import { singleton } from "tsyringe";
import { ITelemetryMemStat, ITelemetryStat } from "../interfaces/telemetry.interface";

@singleton()
export class TelemetryStatsService {
  public average(values: number[]): number {
    if (!values.length) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  public max(values: number[]): number {
    return values.length ? Math.max(...values) : 0;
  }

  public min(values: number[]): number {
    return values.length ? Math.min(...values) : 0;
  }

  /**
   * Linear-interpolation percentile (aka the "R-7"/Excel method), matching
   * common expectations for p95 over a small in-memory sample window.
   */
  public percentile(values: number[], p: number): number {
    if (!values.length) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    if (1 === sorted.length) return sorted[0];

    const rank = (p / 100) * (sorted.length - 1);
    const lower = Math.floor(rank);
    const upper = Math.ceil(rank);

    if (lower === upper) return sorted[lower];

    const weight = rank - lower;
    return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
  }

  public aggregateAvgMaxP95(values: number[]): ITelemetryStat {
    return {
      avg: this.average(values),
      max: this.max(values),
      p95: this.percentile(values, 95),
    };
  }

  public aggregateAvgMinP95(values: number[]): ITelemetryMemStat {
    return {
      avg: this.average(values),
      min: this.min(values),
      p95: this.percentile(values, 95),
    };
  }
}
