import { appendFileSync } from "fs";
import { DateTime } from "luxon";
import { Writable } from "node:stream";
import { singleton } from "tsyringe";
import { APIService } from "../services/api.service";
import { UtilsService } from "../services/utils.service";

@singleton()
export class APILoggerAdapter extends Writable {
  constructor(
    private readonly apiService: APIService,
    private readonly utilsService: UtilsService
  ) {
    super({
      objectMode: true,
      writev: (chunks, callback) => {
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

    this.apiService
      .sendLog(
        chunks.map(({ chunk }) => {
          const [timestamp, level, ...args] = chunk.data;
          return [level, timestamp, ...args].map((item) =>
            "string" !== typeof item ? JSON.stringify(item) : item
          );
        })
      )
      .then(() => {
        if (!pages.length) {
          this.cork();
          process.nextTick(() => this.uncork());
        }
      })
      .catch((error) => {
        chunks.forEach(({ chunk }) => {
          const [timestamp, level, ...message] = chunk.data;
          this.writeToFile(timestamp, level, ...message);
        });
      })
      .finally(() => {
        if (!pages.length) {
          callback();
          return;
        }
        return this.send(pages, callback);
      });
  }

  private writeToFile(timestamp: string, level: string, ...args: any[]) {
    const file = `output/${DateTime.now().toFormat("yyyy-LL-dd")}.log`;
    appendFileSync(file, JSON.stringify([timestamp, level, ...args]) + "\n");
  }
}
