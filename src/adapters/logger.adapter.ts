import { DateTime } from "luxon";
import { Readable } from "node:stream";
import { singleton } from "tsyringe";

@singleton()
export class LoggerAdapter extends Readable {
  constructor() {
    super({ read() {}, objectMode: true });
  }

  public log(level: keyof Console, ...args: any[]): void {
    const timestamp = DateTime.now().toFormat("yyyy-LL-dd HH:mm:ss");
    this.push({ data: [timestamp, level, ...args] });
  }
}
