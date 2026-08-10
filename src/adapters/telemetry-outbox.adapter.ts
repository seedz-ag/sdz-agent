import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { dirname } from "path";
import { singleton } from "tsyringe";

const OUTBOX_PATH = "./output/telemetry-outbox.jsonl";
const MAX_LINES = 240;

/**
 * Append-only local WAL for telemetry snapshots. The agent runs on-premise
 * and may be offline for a while, so snapshots are persisted to disk before
 * being shipped; the shipper drains this file in a single batched POST and
 * only removes the lines that were actually accepted by the server.
 */
@singleton()
export class TelemetryOutboxAdapter {
  public readonly path = OUTBOX_PATH;
  public readonly maxLines = MAX_LINES;

  public append(entries: unknown[]): void {
    if (!entries.length) return;

    this.ensureDir();
    const lines = entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
    appendFileSync(this.path, lines, "utf8");
    this.trim();
  }

  public readAll(): string[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter((line) => "" !== line.trim());
  }

  public removeFirst(count: number): void {
    if (count <= 0) return;
    const remaining = this.readAll().slice(count);
    this.write(remaining);
  }

  private trim(): void {
    const lines = this.readAll();
    if (lines.length > this.maxLines) {
      this.write(lines.slice(lines.length - this.maxLines));
    }
  }

  private write(lines: string[]): void {
    this.ensureDir();
    writeFileSync(this.path, lines.length ? lines.join("\n") + "\n" : "", "utf8");
  }

  private ensureDir(): void {
    mkdirSync(dirname(this.path), { recursive: true });
  }
}
