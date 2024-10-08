import { singleton } from "tsyringe";
import yargs from "yargs";

@singleton()
export class ArgsService {
  private readonly args: Record<string, string>;
  constructor() {
    this.args = (yargs(process.argv) as any).argv;
  }
  public get(key?: string) {
    if (!key) return this.args;
    return this.args[key];
  }
}
