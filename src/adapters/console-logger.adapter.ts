import color from "colors";
import { Writable } from "node:stream";
import { singleton } from "tsyringe";

@singleton()
export class ConsoleLoggerAdapter extends Writable {
  constructor() {
    super({
      objectMode: true,
      write: (
        chunk: any,
        encoding: BufferEncoding,
        callback: (error?: Error | null | undefined) => void
      ): void => {
        this.handle(chunk, callback);
      },
    });
  }

  private handle(
    { data }: any,
    callback: (error?: Error | null | undefined) => void
  ): void {
    const colors: any = {
      error: color.red,
      info: color.blue,
      warn: color.yellow,
    };

    const [timestamp, level, ...args] = data;

    console.log(
      colors[level](timestamp),
      colors[level](` ${level}`.slice(-5)),
      ...args
    );

    callback();
  }
}
