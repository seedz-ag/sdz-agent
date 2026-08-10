import { singleton } from "tsyringe";
import { ITelemetryNetwork } from "../interfaces/telemetry.interface";
import { TelemetryStatsService } from "./telemetry-stats.service";

export type NetworkTelemetryOutcome = "ok" | "error" | "timeout";

/**
 * Passive recorder for the HTTP calls the agent already makes (settings,
 * resources, logs, telemetry itself). No active probing/bandwidth tests are
 * performed here — it just observes real traffic and accumulates counters
 * until the window is snapshotted, at which point it resets for the next
 * one.
 */
@singleton()
export class NetworkTelemetryRecorderService {
  private requests = 0;
  private errors = 0;
  private timeouts = 0;
  private retries = 0;
  private latencies: number[] = [];

  constructor(private readonly telemetryStatsService: TelemetryStatsService) {}

  public recordRequest(outcome: NetworkTelemetryOutcome, latencyMs: number): void {
    this.requests++;
    this.latencies.push(Math.max(0, latencyMs));

    if ("timeout" === outcome) {
      this.timeouts++;
    } else if ("error" === outcome) {
      this.errors++;
    }
  }

  public recordRetry(): void {
    this.retries++;
  }

  public snapshot(): ITelemetryNetwork {
    const network: ITelemetryNetwork = {
      requests: this.requests,
      errors: this.errors,
      timeouts: this.timeouts,
      retries: this.retries,
      latencyMs: this.telemetryStatsService.aggregateAvgMaxP95(this.latencies),
    };
    this.reset();
    return network;
  }

  public reset(): void {
    this.requests = 0;
    this.errors = 0;
    this.timeouts = 0;
    this.retries = 0;
    this.latencies = [];
  }
}
