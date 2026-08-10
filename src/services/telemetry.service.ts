import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "fs";
import { singleton } from "tsyringe";

import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { SystemMetricsAdapter } from "../adapters/system-metrics.adapter";
import { TelemetryOutboxAdapter } from "../adapters/telemetry-outbox.adapter";
import { ITelemetryPayload, TelemetryAgentMode } from "../interfaces/telemetry.interface";
import { EnvironmentService } from "./environment.service";
import { NetworkTelemetryRecorderService } from "./network-telemetry-recorder.service";
import { TelemetrySamplerService } from "./telemetry-sampler.service";
import { UtilsService } from "./utils.service";

export const TELEMETRY_WINDOW_SECONDS = 60;

/**
 * Windowed system+network telemetry collector (AB#132918, phase 4).
 *
 * Every WINDOW_SECONDS it snapshots the CPU/memory sampler and the passive
 * network recorder, builds a v1 envelope identical to what the Go agent
 * sends, appends it to a local WAL (so nothing is lost while offline) and
 * best-effort ships the outstanding WAL entries in a single batched POST.
 * Shipping never throws: failures are logged and the WAL is kept for the
 * next attempt.
 */
@singleton()
export class TelemetryService {
  private windowTimer?: NodeJS.Timeout;
  private mode: TelemetryAgentMode = "scheduler";
  private startedAt = new Date();
  private shipping = false;
  private workload: Record<string, unknown> = {};
  private clockDriftMs: number | null = null;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly networkTelemetryRecorder: NetworkTelemetryRecorderService,
    private readonly outboxAdapter: TelemetryOutboxAdapter,
    private readonly sampler: TelemetrySamplerService,
    private readonly systemMetricsAdapter: SystemMetricsAdapter,
    private readonly utilsService: UtilsService
  ) {}

  public isEnabled(): boolean {
    return "off" !== String(process.env.TELEMETRY || "").trim().toLowerCase();
  }

  public isRunning(): boolean {
    return undefined !== this.windowTimer;
  }

  /**
   * Starts the collector for the given long-running mode. Idempotent: once
   * started (by whichever caller gets there first), further calls are a
   * no-op, so a scheduler that also spins up the listen loop keeps
   * reporting mode "scheduler" instead of being overwritten.
   */
  public start(mode: TelemetryAgentMode): void {
    if (!this.isEnabled() || this.windowTimer) return;

    this.mode = mode;
    this.startedAt = new Date();
    this.networkTelemetryRecorder.reset();
    this.sampler.start();

    this.windowTimer = setInterval(
      () => void this.collectAndShip(),
      TELEMETRY_WINDOW_SECONDS * 1_000
    );
    this.windowTimer.unref?.();
  }

  public stop(): void {
    this.sampler.stop();
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
      this.windowTimer = undefined;
    }
  }

  public setWorkloadContext(patch: Record<string, unknown>): void {
    this.workload = { ...this.workload, ...patch };
  }

  public async collectAndShip(): Promise<void> {
    try {
      const payload = this.buildPayload();
      this.outboxAdapter.append([payload]);
    } catch (error: any) {
      this.loggerAdapter.log(
        "error",
        "TELEMETRY COLLECT FAILED",
        error?.message || error
      );
    }

    await this.ship();
  }

  private buildPayload(): ITelemetryPayload {
    const { cpuPercent, memFreeBytes } = this.sampler.snapshot();
    const network = this.networkTelemetryRecorder.snapshot();
    const disk = this.systemMetricsAdapter.getDiskStats(process.cwd());

    return {
      schemaVersion: 1,
      agent: {
        name: "sdz-agent",
        version: this.utilsService.getPackageVersion(),
        mode: this.mode,
      },
      host: {
        hostname: this.systemMetricsAdapter.getHostname(),
        os: this.systemMetricsAdapter.getOsName(),
        osVersion: this.systemMetricsAdapter.getOsVersion(),
        arch: this.systemMetricsAdapter.getArch(),
        timezone: this.systemMetricsAdapter.getTimezone(),
        utcOffsetMinutes: this.systemMetricsAdapter.getUtcOffsetMinutes(),
        clockDriftMs: this.clockDriftMs,
      },
      runtime: {
        startedAt: this.startedAt.toISOString(),
        uptimeSec: Math.round(process.uptime()),
      },
      windowSeconds: TELEMETRY_WINDOW_SECONDS,
      resources: {
        cpuCount: this.systemMetricsAdapter.getCpuCount(),
        cpuPercent,
        memTotalBytes: this.systemMetricsAdapter.getMemTotalBytes(),
        memFreeBytes,
        diskTotalBytes: disk.totalBytes,
        diskFreeBytes: disk.freeBytes,
      },
      network,
      workload: this.buildWorkload(),
      collectedAt: new Date().toISOString(),
    };
  }

  private buildWorkload(): Record<string, unknown> {
    return {
      ...this.workload,
      listen: "listen" === this.mode || "true" === process.env.LISTEN,
      outputBacklog: this.getOutputBacklog(),
    };
  }

  private getOutputBacklog(): { files: number; bytes: number } {
    try {
      const entries = readdirSync("./output").filter(
        (name) => !name.startsWith(".") && this.outboxAdapter.path !== `./output/${name}`
      );
      const bytes = entries.reduce((sum, name) => {
        try {
          return sum + statSync(`./output/${name}`).size;
        } catch {
          return sum;
        }
      }, 0);
      return { files: entries.length, bytes };
    } catch {
      return { files: 0, bytes: 0 };
    }
  }

  private async ship(): Promise<void> {
    if (this.shipping) return;
    this.shipping = true;

    try {
      const lines = this.outboxAdapter.readAll();
      if (!lines.length) return;

      const batch = lines.map((line) => JSON.parse(line));
      const requestSentAt = Date.now();

      const { headers: responseHeaders } = await this.httpClientAdapter.postRaw(
        `${this.environmentService.get("API_URL")}telemetry`,
        batch,
        {
          headers: this.getHeaders(),
          timeout: this.environmentService.get("API_REQUEST_TIMEOUT"),
        }
      );

      this.updateClockDrift(responseHeaders, requestSentAt);
      this.outboxAdapter.removeFirst(lines.length);
    } catch (error: any) {
      this.loggerAdapter.log(
        "warn",
        "TELEMETRY SHIP FAILED, KEEPING OUTBOX FOR RETRY",
        error?.message || error
      );
    } finally {
      this.shipping = false;
    }
  }

  /**
   * Derives clock drift from the API's `Date` response header. Attributes
   * the full round-trip to the local->server leg (a slight overestimate),
   * which is fine for spotting gross drift but not a precise offset.
   */
  private updateClockDrift(
    responseHeaders: Record<string, string>,
    requestSentAt: number
  ): void {
    const serverDateHeader = responseHeaders?.date;
    if (!serverDateHeader) return;

    const serverTime = Date.parse(serverDateHeader);
    if (Number.isNaN(serverTime)) return;

    this.clockDriftMs = requestSentAt - serverTime;
  }

  private getHeaders() {
    return {
      Authorization: `Basic ${Buffer.from(
        `${this.environmentService.get("CLIENT_ID")}:${this.environmentService.get(
          "CLIENT_SECRET"
        )}`
      ).toString("base64")}`,
      "sdz-request-id": randomUUID(),
    };
  }
}
