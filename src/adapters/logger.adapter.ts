import color from "colors";
import { appendFileSync } from "fs";
import { DateTime } from "luxon";
import { Writable } from "node:stream";
import { singleton } from "tsyringe";

type LoggerAdapterPipe = (
  timestamp: string,
  level: string,
  ...args: any[]
) => Promise<void>;

@singleton()
export class LoggerAdapter {
  private readonly stream: Writable;

  private pipe: Array<LoggerAdapterPipe> = [];

  constructor() {
    this.stream = new Writable({
      write: async (chunk: any, encoding: string, done: Function) => {
        const [timestamp, level, ...args] = JSON.parse(chunk.toString());

        try {
          if (!this.pipe.length) {
            throw new Error();
          }
          for (const callback of this.pipe) {
            await callback(timestamp, level, ...args);
          }
        } catch (e) {
          this.writeToFile(timestamp, level, ...args);
        }

        if ("true" === process.env.VERBOSE) {
          const [timestamp, level, ...args] = JSON.parse(chunk.toString());
          this.writeToStdOut(timestamp, level, ...args);
        }

        done();
      },
    });
  }

  private writeToFile(timestamp: string, level: string, ...args: any[]) {
    const file = `output/${DateTime.now().toFormat("yyyy-LL-dd")}.log`;
    appendFileSync(file, JSON.stringify([level, timestamp, ...args]) + "\n");
  }

  private writeToStdOut(timestamp: string, level: string, ...args: any[]) {
    const colors: any = {
      error: color.red,
      info: color.blue,
      warn: color.yellow
    };
    const hasSpinner = !!(global as any).spinner;
    const logger = hasSpinner
      ? (...text: string[]) => ((global as any).spinner.text = text.join(" "))
      : (console as any)[level];
    logger(`${(colors as any)[level](`[${timestamp}]`)}`, ...args);
  }

  public addPipe(callback: LoggerAdapterPipe): void {
    this.pipe.push(callback);
  }

  public log(level: keyof Console, ...args: any[]): void {
    const timestamp = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss");
    this.stream.write(Buffer.from(JSON.stringify([timestamp, level, ...args])));
  }
}
