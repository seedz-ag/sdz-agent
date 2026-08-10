export type TelemetryAgentMode = "scheduler" | "listen";

export type TelemetryHostOS = "windows" | "linux" | "darwin";

export interface ITelemetryStat {
  avg: number;
  max: number;
  p95: number;
}

export interface ITelemetryMemStat {
  avg: number;
  min: number;
  p95: number;
}

export interface ITelemetryAgentInfo {
  name: string;
  version: string;
  mode: TelemetryAgentMode;
}

export interface ITelemetryHostInfo {
  hostname: string;
  os: TelemetryHostOS | string;
  osVersion: string;
  arch: string;
}

export interface ITelemetryRuntimeInfo {
  startedAt: string;
  uptimeSec: number;
}

export interface ITelemetryResources {
  cpuCount: number;
  cpuPercent: ITelemetryStat;
  memTotalBytes: number;
  memFreeBytes: ITelemetryMemStat;
  diskTotalBytes: number;
  diskFreeBytes: number;
}

export interface ITelemetryNetwork {
  requests: number;
  errors: number;
  timeouts: number;
  retries: number;
  latencyMs: ITelemetryStat;
}

export interface ITelemetryPayload {
  schemaVersion: 1;
  agent: ITelemetryAgentInfo;
  host: ITelemetryHostInfo;
  runtime: ITelemetryRuntimeInfo;
  windowSeconds: number;
  resources: ITelemetryResources;
  network: ITelemetryNetwork;
  workload: Record<string, unknown>;
  collectedAt: string;
}
