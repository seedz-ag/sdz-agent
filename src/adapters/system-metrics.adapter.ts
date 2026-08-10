import { readFileSync, statfsSync } from "fs";
import * as os from "os";
import { singleton } from "tsyringe";
import { TelemetryHostOS } from "../interfaces/telemetry.interface";

export type ICpuTimesSnapshot = { idle: number; total: number };

export type IDiskStats = { totalBytes: number; freeBytes: number };

const OS_NAME_BY_PLATFORM: Record<string, TelemetryHostOS> = {
  win32: "windows",
  linux: "linux",
  darwin: "darwin",
};

@singleton()
export class SystemMetricsAdapter {
  public getCpuCount(): number {
    return os.cpus().length;
  }

  public sampleCpuTimes(): ICpuTimesSnapshot {
    return os.cpus().reduce<ICpuTimesSnapshot>(
      (acc, cpu) => {
        const { user, nice, sys, idle, irq } = cpu.times;
        acc.idle += idle;
        acc.total += user + nice + sys + idle + irq;
        return acc;
      },
      { idle: 0, total: 0 }
    );
  }

  public cpuPercentBetween(
    previous: ICpuTimesSnapshot,
    current: ICpuTimesSnapshot
  ): number {
    const idleDelta = current.idle - previous.idle;
    const totalDelta = current.total - previous.total;

    if (totalDelta <= 0) return 0;

    const busyRatio = 1 - idleDelta / totalDelta;
    return Math.max(0, Math.min(100, busyRatio * 100));
  }

  public getMemTotalBytes(): number {
    return os.totalmem();
  }

  /**
   * "Available" memory (not raw "free"): on Linux this is /proc/meminfo's
   * MemAvailable, which accounts for reclaimable caches/buffers. Any other
   * platform (or a read failure) falls back to os.freemem().
   */
  public getMemFreeBytes(): number {
    if ("linux" === process.platform) {
      const available = this.readLinuxMemAvailable();
      if (undefined !== available) return available;
    }
    return os.freemem();
  }

  private readLinuxMemAvailable(): number | undefined {
    try {
      const content = readFileSync("/proc/meminfo", "utf8");
      const match = content.match(/^MemAvailable:\s+(\d+)\s+kB$/m);
      if (!match) return undefined;
      return Number(match[1]) * 1024;
    } catch {
      return undefined;
    }
  }

  public getDiskStats(path: string = process.cwd()): IDiskStats {
    try {
      const stats = statfsSync(path);
      return {
        totalBytes: Number(stats.bsize) * Number(stats.blocks),
        freeBytes: Number(stats.bsize) * Number(stats.bavail),
      };
    } catch {
      return { totalBytes: 0, freeBytes: 0 };
    }
  }

  public getHostname(): string {
    return os.hostname();
  }

  public getArch(): string {
    return os.arch();
  }

  public getOsVersion(): string {
    return os.release();
  }

  public getOsName(): TelemetryHostOS | string {
    return OS_NAME_BY_PLATFORM[process.platform] || process.platform;
  }

  public getTimezone(): string {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  /**
   * Minutes east of UTC (e.g. America/Sao_Paulo => -180), the inverse sign
   * of Date.prototype.getTimezoneOffset().
   */
  public getUtcOffsetMinutes(): number {
    return -new Date().getTimezoneOffset();
  }
}
