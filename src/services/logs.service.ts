import { glob } from "fast-glob";
import { createReadStream, unlinkSync } from "fs";
import { createInterface } from "readline";
import { Readable, Stream } from "stream";
import { singleton } from "tsyringe";
import { APIService } from "./api.service";
import { UtilsService } from "./utils.service";

type LogsServiceConsumeInput = {
  file: string;
  onClose?: (stream: Readable) => Promise<void>;
  onLine?: (line: string, stream: Readable) => Promise<void>;
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

    lines.on("line", (chunk) => onLine(chunk, stream));

    await new Promise<void>(async (resolve) => {
      lines.on("close", async () => {
        onClose && (await onClose(stream));
        resolve();
      });
    });
  }

  public async consumeOutput() {
    const files = await glob("./output/*.log");
    for (const file of files) {
      let list: string[][] = [];
      await this.consume({
        file,
        onLine: async (line: string, stream: Readable) => {
          if (!line) {
            return;
          }

          list.push(JSON.parse(line));

          if (list.length === 100) {
            const buffer = [...list];
            stream.once("pause", async () => {
              await this.apiService.sendLog(
                buffer.map((item) => [item[1], item[0], item[2]])
              );
              stream.resume();
            });
            list = [];
            stream.pause();
          }
        },
        onClose: async (stream) => {
          stream.resume();

          if (!list.length) return;

          await this.apiService.sendLog(
            list.map((item) => {
              return [item[1], item[0], item[2]];
            })
          );
        },
      });
      files.forEach(unlinkSync);
    }
  }
}
