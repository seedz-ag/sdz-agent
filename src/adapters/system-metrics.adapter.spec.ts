import "reflect-metadata";

jest.mock("fs", () => ({
  ...jest.requireActual("fs"),
  readFileSync: jest.fn(),
  statfsSync: jest.fn(),
}));
jest.mock("os", () => ({
  ...jest.requireActual("os"),
  freemem: jest.fn(jest.requireActual("os").freemem),
}));

import { readFileSync, statfsSync } from "fs";
import { freemem } from "os";
import { SystemMetricsAdapter } from "./system-metrics.adapter";

const mockedReadFileSync = readFileSync as jest.Mock;
const mockedStatfsSync = statfsSync as jest.Mock;
const mockedFreemem = freemem as jest.Mock;

describe("SystemMetricsAdapter", () => {
  let adapter: SystemMetricsAdapter;
  let originalPlatform: NodeJS.Platform;

  beforeEach(() => {
    adapter = new SystemMetricsAdapter();
    originalPlatform = process.platform;
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
    jest.clearAllMocks();
  });

  const setPlatform = (platform: NodeJS.Platform) => {
    Object.defineProperty(process, "platform", { value: platform });
  };

  describe("cpuPercentBetween (cpu-delta computation)", () => {
    it("computes busy percentage from the idle/total delta between two samples", () => {
      const previous = { idle: 100, total: 200 };
      const current = { idle: 150, total: 400 };
      // idleDelta=50, totalDelta=200 -> busy = 1 - 50/200 = 0.75 -> 75%
      expect(adapter.cpuPercentBetween(previous, current)).toBeCloseTo(75, 5);
    });

    it("returns 0 for a fully idle delta", () => {
      const previous = { idle: 100, total: 200 };
      const current = { idle: 200, total: 300 };
      // idleDelta=100, totalDelta=100 -> busy = 0
      expect(adapter.cpuPercentBetween(previous, current)).toBe(0);
    });

    it("returns 0 (not negative/NaN) when totalDelta is zero or negative", () => {
      expect(adapter.cpuPercentBetween({ idle: 10, total: 10 }, { idle: 10, total: 10 })).toBe(0);
      expect(adapter.cpuPercentBetween({ idle: 10, total: 20 }, { idle: 5, total: 15 })).toBe(0);
    });

    it("clamps to [0, 100]", () => {
      const previous = { idle: 0, total: 0 };
      const current = { idle: -10, total: 10 };
      expect(adapter.cpuPercentBetween(previous, current)).toBeLessThanOrEqual(100);
    });
  });

  describe("getMemFreeBytes (MemAvailable parsing)", () => {
    it("parses MemAvailable (kB) from /proc/meminfo on linux", () => {
      setPlatform("linux");
      mockedReadFileSync.mockReturnValue(
        [
          "MemTotal:       16384000 kB",
          "MemFree:         1000000 kB",
          "MemAvailable:    5000000 kB",
          "Buffers:          200000 kB",
        ].join("\n")
      );

      expect(adapter.getMemFreeBytes()).toBe(5_000_000 * 1024);
    });

    it("falls back to os.freemem() on linux when /proc/meminfo can't be read", () => {
      setPlatform("linux");
      mockedReadFileSync.mockImplementation(() => {
        throw new Error("ENOENT");
      });
      mockedFreemem.mockReturnValue(123_456);

      expect(adapter.getMemFreeBytes()).toBe(123_456);
    });

    it("falls back to os.freemem() on linux when MemAvailable is missing", () => {
      setPlatform("linux");
      mockedReadFileSync.mockReturnValue("MemTotal: 16384000 kB\n");
      mockedFreemem.mockReturnValue(777);

      expect(adapter.getMemFreeBytes()).toBe(777);
    });

    it("uses os.freemem() directly on non-linux platforms", () => {
      setPlatform("darwin");
      mockedFreemem.mockReturnValue(999);

      expect(adapter.getMemFreeBytes()).toBe(999);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });
  });

  describe("getDiskStats", () => {
    it("computes total/free bytes from statfsSync", () => {
      mockedStatfsSync.mockReturnValue({
        bsize: 4096,
        blocks: 1000,
        bavail: 250,
      });

      expect(adapter.getDiskStats("/some/path")).toEqual({
        totalBytes: 4096 * 1000,
        freeBytes: 4096 * 250,
      });
    });

    it("falls back to zeros when statfsSync throws", () => {
      mockedStatfsSync.mockImplementation(() => {
        throw new Error("EPERM");
      });

      expect(adapter.getDiskStats("/some/path")).toEqual({
        totalBytes: 0,
        freeBytes: 0,
      });
    });
  });

  describe("getOsName", () => {
    it.each([
      ["win32", "windows"],
      ["linux", "linux"],
      ["darwin", "darwin"],
    ])("maps process.platform %s to %s", (platform, expected) => {
      setPlatform(platform as NodeJS.Platform);
      expect(adapter.getOsName()).toBe(expected);
    });

    it("falls back to the raw platform for unmapped values", () => {
      setPlatform("freebsd" as NodeJS.Platform);
      expect(adapter.getOsName()).toBe("freebsd");
    });
  });
});
