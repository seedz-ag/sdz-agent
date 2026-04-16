import { appendFile, mkdir } from "fs/promises";
import { DateTime } from "luxon";
import { Writable } from "node:stream";
import { singleton } from "tsyringe";
import { APIService } from "../services/api.service";
import { UtilsService } from "../services/utils.service";

@singleton()
export class APILoggerAdapter extends Writable {
  public received = 0;
  public sent = 0;
  public total = 0;
  constructor(
    private readonly apiService: APIService,
    private readonly utilsService: UtilsService
  ) {
    super({
      objectMode: true,
      writev: (chunks, callback) => {
        this.total += chunks.length
        this.received++;
        const pages = this.utilsService.chunkData(chunks, 100);
        this.send(pages, callback);
      },
    });
  }

  private send<T>(
    pages: { chunk: { data: string[] } }[][],
    callback: (error?: Error | null | undefined) => void
  ) {
    if (!pages.length) {
      callback();
      return;
    }

    const chunks = pages.shift();

    if (!chunks || !chunks.length) {
      callback();
      return;
    }

    const payload = chunks.map(({ chunk }) => {
      const [timestamp, level, ...args] = chunk.data;
      return [level, timestamp, ...args].map((item) =>
        "string" !== typeof item ? JSON.stringify(item) : item
      );
    });

    this.apiService
      .sendLog(payload)
      .then(() => {
        if (!pages.length) {
          this.cork();
          process.nextTick(() => this.uncork());
        }
      })
      .catch(async () => {
        try {
          await this.apiService.sendLog(payload);
        } catch {
          chunks.forEach(({ chunk }) => {
            const [timestamp, level, ...message] = chunk.data;
            this.writeToFile(timestamp, level, ...message);
          });
        }
      })
      .finally(() => {
        if (!pages.length) {
          this.sent++;
          callback();
          return;
        }
        return this.send(pages, callback);
      });
  }

  private async writeToFile(timestamp: string, level: string, ...args: any[]) {
    const file = `output/${DateTime.now().toFormat("yyyy-LL-dd")}.log`;
    await mkdir("output", { recursive: true }).catch(() => {});
    await appendFile(file, JSON.stringify([timestamp, level, ...args]) + "\n").catch(() => {});
  }
}
