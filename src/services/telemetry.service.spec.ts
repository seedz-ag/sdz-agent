import "reflect-metadata";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { SystemMetricsAdapter } from "../adapters/system-metrics.adapter";
import { TelemetryOutboxAdapter } from "../adapters/telemetry-outbox.adapter";
import { EnvironmentService } from "./environment.service";
import { NetworkTelemetryRecorderService } from "./network-telemetry-recorder.service";
import { TelemetrySamplerService } from "./telemetry-sampler.service";
import { TelemetryService } from "./telemetry.service";
import { UtilsService } from "./utils.service";

const ENV: Record<string, unknown> = {
  API_URL: "https://api.example.com/",
  CLIENT_ID: "the-client-id",
  CLIENT_SECRET: "the-client-secret",
  API_REQUEST_TIMEOUT: 300_000,
};

describe("TelemetryService", () => {
  let environmentService: any;
  let httpClientAdapter: any;
  let loggerAdapter: any;
  let networkTelemetryRecorder: any;
  let outboxAdapter: any;
  let sampler: any;
  let systemMetricsAdapter: any;
  let utilsService: any;
  let service: TelemetryService;

  const originalTelemetryEnv = process.env.TELEMETRY;

  beforeEach(() => {
    delete process.env.TELEMETRY;

    environmentService = { get: jest.fn((key: any) => ENV[key]) };
    httpClientAdapter = { post: jest.fn().mockResolvedValue(undefined) };
    loggerAdapter = { log: jest.fn() };
    networkTelemetryRecorder = {
      snapshot: jest.fn().mockReturnValue({
        requests: 3,
        errors: 0,
        timeouts: 0,
        retries: 0,
        latencyMs: { avg: 12, max: 20, p95: 18 },
      }),
      reset: jest.fn(),
    };
    outboxAdapter = {
      path: "./output/telemetry-outbox.jsonl",
      append: jest.fn(),
      readAll: jest.fn().mockReturnValue([]),
      removeFirst: jest.fn(),
    } as any;
    sampler = {
      start: jest.fn(),
      stop: jest.fn(),
      snapshot: jest.fn().mockReturnValue({
        cpuPercent: { avg: 10, max: 30, p95: 25 },
        memFreeBytes: { avg: 1_000, min: 500, p95: 900 },
      }),
    };
    systemMetricsAdapter = {
      getDiskStats: jest.fn().mockReturnValue({ totalBytes: 500_000, freeBytes: 200_000 }),
      getHostname: jest.fn().mockReturnValue("agent-host"),
      getOsName: jest.fn().mockReturnValue("linux"),
      getOsVersion: jest.fn().mockReturnValue("5.15.0"),
      getArch: jest.fn().mockReturnValue("x64"),
      getCpuCount: jest.fn().mockReturnValue(4),
      getMemTotalBytes: jest.fn().mockReturnValue(8_000_000),
    };
    utilsService = { getPackageVersion: jest.fn().mockReturnValue("9.9.9") };

    service = new TelemetryService(
      environmentService as unknown as EnvironmentService,
      httpClientAdapter as unknown as HttpClientAdapter,
      loggerAdapter,
      networkTelemetryRecorder as unknown as NetworkTelemetryRecorderService,
      outboxAdapter as unknown as TelemetryOutboxAdapter,
      sampler as unknown as TelemetrySamplerService,
      systemMetricsAdapter as unknown as SystemMetricsAdapter,
      utilsService as unknown as UtilsService
    );
  });

  afterEach(() => {
    service.stop();
    if (undefined === originalTelemetryEnv) {
      delete process.env.TELEMETRY;
    } else {
      process.env.TELEMETRY = originalTelemetryEnv;
    }
  });

  describe("TELEMETRY=off", () => {
    it("isEnabled() is false", () => {
      process.env.TELEMETRY = "off";
      expect(service.isEnabled()).toBe(false);
    });

    it("is case-insensitive and trims whitespace", () => {
      process.env.TELEMETRY = " OFF ";
      expect(service.isEnabled()).toBe(false);
    });

    it("start() is a no-op: no sampler/window is started", () => {
      process.env.TELEMETRY = "off";
      service.start("scheduler");
      expect(service.isRunning()).toBe(false);
      expect(sampler.start).not.toHaveBeenCalled();
    });

    it("is enabled by default (unset) and for any other value", () => {
      expect(service.isEnabled()).toBe(true);
      process.env.TELEMETRY = "on";
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe("start()", () => {
    it("starts the sampler and marks the collector as running", () => {
      service.start("listen");
      expect(sampler.start).toHaveBeenCalledTimes(1);
      expect(service.isRunning()).toBe(true);
    });

    it("is idempotent: a second start() with a different mode doesn't override the first", async () => {
      service.start("scheduler");
      service.start("listen");
      expect(sampler.start).toHaveBeenCalledTimes(1);

      await service.collectAndShip();
      const [[payload]] = outboxAdapter.append.mock.calls;
      expect(payload[0].agent.mode).toBe("scheduler");
    });
  });

  describe("collectAndShip()", () => {
    it("builds a v1 envelope, appends it to the WAL, then ships and drains on success", async () => {
      service.start("scheduler");
      outboxAdapter.readAll.mockReturnValue([]);

      await service.collectAndShip();

      expect(outboxAdapter.append).toHaveBeenCalledTimes(1);
      const [[appended]] = outboxAdapter.append.mock.calls;
      expect(appended).toHaveLength(1);

      const payload = appended[0];
      expect(payload).toMatchObject({
        schemaVersion: 1,
        agent: { name: "sdz-agent", version: "9.9.9", mode: "scheduler" },
        host: { hostname: "agent-host", os: "linux", osVersion: "5.15.0", arch: "x64" },
        windowSeconds: 60,
        resources: {
          cpuCount: 4,
          cpuPercent: { avg: 10, max: 30, p95: 25 },
          memTotalBytes: 8_000_000,
          memFreeBytes: { avg: 1_000, min: 500, p95: 900 },
          diskTotalBytes: 500_000,
          diskFreeBytes: 200_000,
        },
        network: {
          requests: 3,
          errors: 0,
          timeouts: 0,
          retries: 0,
          latencyMs: { avg: 12, max: 20, p95: 18 },
        },
      });
      expect(typeof payload.runtime.startedAt).toBe("string");
      expect(typeof payload.collectedAt).toBe("string");
      expect(typeof payload.workload).toBe("object");
    });

    it("ships the outbox as a single array POST, with Basic auth + sdz-request-id headers", async () => {
      outboxAdapter.readAll.mockReturnValue([
        JSON.stringify({ schemaVersion: 1, foo: "bar" }),
      ]);

      await service.collectAndShip();

      expect(httpClientAdapter.post).toHaveBeenCalledTimes(1);
      const [url, body, config] = httpClientAdapter.post.mock.calls[0];

      expect(url).toBe("https://api.example.com/telemetry");
      expect(Array.isArray(body)).toBe(true);
      expect(body).toEqual([{ schemaVersion: 1, foo: "bar" }]);

      const expectedAuth = `Basic ${Buffer.from("the-client-id:the-client-secret").toString(
        "base64"
      )}`;
      expect(config.headers.Authorization).toBe(expectedAuth);
      expect(config.headers["sdz-request-id"]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      expect(config.timeout).toBe(300_000);

      expect(outboxAdapter.removeFirst).toHaveBeenCalledWith(1);
    });

    it("does nothing (no HTTP call) when the outbox is empty", async () => {
      outboxAdapter.append.mockImplementation(() => {
        // simulate append failing to persist so readAll stays empty
      });
      outboxAdapter.readAll.mockReturnValue([]);

      await service.collectAndShip();

      expect(httpClientAdapter.post).not.toHaveBeenCalled();
      expect(outboxAdapter.removeFirst).not.toHaveBeenCalled();
    });

    it("is best-effort: a shipping failure is logged and the WAL is kept (no throw)", async () => {
      outboxAdapter.readAll.mockReturnValue([JSON.stringify({ schemaVersion: 1 })]);
      httpClientAdapter.post.mockRejectedValueOnce(new Error("network down"));

      await expect(service.collectAndShip()).resolves.toBeUndefined();

      expect(outboxAdapter.removeFirst).not.toHaveBeenCalled();
      expect(loggerAdapter.log).toHaveBeenCalledWith(
        "warn",
        expect.stringContaining("TELEMETRY SHIP FAILED"),
        expect.anything()
      );
    });

    it("never throws even if building the payload fails", async () => {
      systemMetricsAdapter.getDiskStats.mockImplementation(() => {
        throw new Error("boom");
      });

      await expect(service.collectAndShip()).resolves.toBeUndefined();
      expect(loggerAdapter.log).toHaveBeenCalledWith(
        "error",
        expect.stringContaining("TELEMETRY COLLECT FAILED"),
        expect.anything()
      );
    });
  });
});
