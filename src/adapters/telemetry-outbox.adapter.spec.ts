import "reflect-metadata";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { TelemetryOutboxAdapter } from "./telemetry-outbox.adapter";

describe("TelemetryOutboxAdapter (local WAL)", () => {
  let tmpDir: string;
  let originalCwd: string;
  let adapter: TelemetryOutboxAdapter;

  beforeEach(() => {
    originalCwd = process.cwd();
    tmpDir = mkdtempSync(join(tmpdir(), "sdz-agent-telemetry-"));
    process.chdir(tmpDir);
    adapter = new TelemetryOutboxAdapter();
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns no lines when the outbox file doesn't exist yet", () => {
    expect(adapter.readAll()).toEqual([]);
  });

  it("appends entries as JSON lines and reads them back", () => {
    adapter.append([{ n: 1 }, { n: 2 }]);
    adapter.append([{ n: 3 }]);

    const lines = adapter.readAll().map((line) => JSON.parse(line));
    expect(lines).toEqual([{ n: 1 }, { n: 2 }, { n: 3 }]);
  });

  it("drains (removes) only the first N lines, keeping the rest", () => {
    adapter.append([{ n: 1 }, { n: 2 }, { n: 3 }]);
    adapter.removeFirst(2);

    const lines = adapter.readAll().map((line) => JSON.parse(line));
    expect(lines).toEqual([{ n: 3 }]);
  });

  it("is a no-op when draining a count <= 0", () => {
    adapter.append([{ n: 1 }]);
    adapter.removeFirst(0);
    expect(adapter.readAll()).toHaveLength(1);
  });

  it("trims the oldest entries beyond the cap, keeping the most recent ones", () => {
    const total = adapter.maxLines + 10;
    const entries = Array.from({ length: total }, (_, i) => ({ i }));
    adapter.append(entries);

    const lines = adapter.readAll().map((line) => JSON.parse(line));
    expect(lines).toHaveLength(adapter.maxLines);
    // the oldest 10 entries (i=0..9) should have been dropped
    expect(lines[0]).toEqual({ i: 10 });
    expect(lines[lines.length - 1]).toEqual({ i: total - 1 });
  });
});
