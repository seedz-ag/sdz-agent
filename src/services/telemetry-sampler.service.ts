import { singleton } from "tsyringe";
import { ICpuTimesSnapshot, SystemMetricsAdapter } from "../adapters/system-metrics.adapter";
import { ITelemetryMemStat, ITelemetryStat } from "../interfaces/telemetry.interface";
import { TelemetryStatsService } from "./telemetry-stats.service";

export const SAMPLE_INTERVAL_MS = 1_000;

export type ITelemetrySamplerSnapshot = {
  cpuPercent: ITelemetryStat;
  memFreeBytes: ITelemetryMemStat;
};

/**
 * Ticks roughly every second, capturing a CPU% sample (via os.cpus() time
 * deltas) and an available-memory sample. Samples accumulate for the
 * duration of a collection window (60s) so peaks aren't missed; snapshot()
 * reduces them to avg/max/p95 (mem uses min instead of max, since the
 * minimum available memory is the peak of usage) and resets the window.
 */
@singleton()
export class TelemetrySamplerService {
  private timer?: NodeJS.Timeout;
  private previousCpuTimes?: ICpuTimesSnapshot;
  private cpuPercentSamples: number[] = [];
  private memFreeSamples: number[] = [];

  constructor(
    private readonly systemMetricsAdapter: SystemMetricsAdapter,
    private readonly telemetryStatsService: TelemetryStatsService
  ) {}

  public start(): void {
    if (this.timer) return;

    this.previousCpuTimes = this.systemMetricsAdapter.sampleCpuTimes();
    this.timer = setInterval(() => this.tick(), SAMPLE_INTERVAL_MS);
    this.timer.unref?.();
  }

  public stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = undefined;
  }

  public tick(): void {
    const current = this.systemMetricsAdapter.sampleCpuTimes();

    if (this.previousCpuTimes) {
      this.cpuPercentSamples.push(
        this.systemMetricsAdapter.cpuPercentBetween(this.previousCpuTimes, current)
      );
    }

    this.previousCpuTimes = current;
    this.memFreeSamples.push(this.systemMetricsAdapter.getMemFreeBytes());
  }

  public snapshot(): ITelemetrySamplerSnapshot {
    const snapshot: ITelemetrySamplerSnapshot = {
      cpuPercent: this.telemetryStatsService.aggregateAvgMaxP95(this.cpuPercentSamples),
      memFreeBytes: this.telemetryStatsService.aggregateAvgMinP95(this.memFreeSamples),
    };

    this.cpuPercentSamples = [];
    this.memFreeSamples = [];

    return snapshot;
  }
}
