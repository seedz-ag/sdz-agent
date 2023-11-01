import { glob } from "fast-glob";
import { createReadStream, unlinkSync } from "fs";
import { createInterface } from "readline";
import fs from "fs";
import { singleton } from "tsyringe";
import { APIService } from "./api.service";
import { Stream } from "stream";
import { UtilsService } from "./utils.service";

type LogsServiceConsumeInput = {
  file: string;
  onClose?: () => Promise<void>;
  onLine?: (line: string) => Promise<void>;
};

@singleton()
export class LogsService {
  constructor(
    private readonly apiService: APIService,
    private readonly utilsService: UtilsService
  ) {}

  public async consume({
    file,
    onLine,
    onClose,
  }: LogsServiceConsumeInput): Promise<Stream | void> {
    const stream = createReadStream(file);

    if (!onLine) {
      return stream;
    }

    const lines = createInterface({
      input: stream,
      crlfDelay: Infinity,
    });

    lines.on("line", onLine);

    await new Promise<void>(async (resolve) => {
      lines.on("close", async () => {
        onClose && (await onClose());
        resolve();
      });
    });
  }

  public async consumeOutput() {
    const files = await glob("./output/*.log");
    for (const file of files) {
      const list: string[][] = [];

      await this.consume({
        file,
        onLine: async (line: string) => {
          if (!line) {
            return;
          }

          list.push(JSON.parse(line));
        },
      });

      if (list.length) {
        const chunks = this.utilsService.chunkData(list, 100);
        for (const chunk of chunks) {
          await this.apiService.sendLog(chunk);
        }
      }
        files.forEach(fs.unlinkSync)
    }
  }
}
