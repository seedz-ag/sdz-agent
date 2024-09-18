import { fork } from "child_process";
import kill from "tree-kill";
import { writeFile } from "fs";
import { singleton } from "tsyringe";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { IParameter, ISchema } from "../interfaces/setting.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { EnvironmentService } from "./environment.service";

@singleton()
export class UtilsService {
  private counter: Record<string, number> = {};
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly loggerAdapter: LoggerAdapter
  ) { }

  public chunkData<T = unknown>(data: T[], length?: number): T[][] {
    const split = Number(
      length || this.environmentService.get("CHUNK_SIZE") || 1000
    );

    const fn = (arr: any, split: number, acc: any = []): any => {
      return arr.length <= split
        ? [...acc, arr]
        : fn(arr.slice(split), split, [...acc, arr.slice(0, split)]);
    };

    return fn(data, split);
  }

  public calculateRetryTime(retry: number, baseTime: number): number {
    let time = baseTime;
    for (let i = 0; i < retry; i++) {
      time = 2 * time;
    }
    return time;
  }

  public extractDatabaseConfig(parameters: IParameter[]) {
    return parameters
      .filter(({ Key }) => Key.startsWith("DATABASE_"))
      .reduce((previous, current) => {
        previous[current.Key.replace(/DATABASE_/, "").toLowerCase()] =
          current.Value;
        return previous;
      }, {} as Record<string, string>) as unknown as ConfigDatabaseInterface;
  }

  public findParameter(
    parameters: IParameter[],
    key: string
  ): string | undefined {
    return parameters.find(({ Key }) => key === Key)?.Value;
  }

  public fork(job: string) {
    return fork(job, process.argv, {
      execArgv: ["-r", "ts-node/register"],
    });
  }

  public hasAgentSchemaForCurrentEntity(
    schemas: ISchema[],
    entity: string
  ): boolean {
    return schemas.some(
      ({ Entity, InputFormat }) => entity === Entity && "AGENT" === InputFormat
    );
  }

  async killProcess(pid: number): Promise<void> {
    kill(pid);
  }

  async killChildrenProcess(children: number[]): Promise<void> {
    for (const pid of children) {
      await this.killProcess(pid);
    }
  }

  public mergeEnv(args: Record<string, any>) {
    Object.assign(
      process.env,
      Object.fromEntries(
        Object.entries(args)
          .filter(([key]) => !["_", "$0"].includes(key))
          .map(([key, value]) => [key.toUpperCase().replace(/-/g, "_"), value])
      )
    );
  }

  public needsToHydrate(schema: ISchema): boolean {
    return schema.InputFormat === "AGENT" && !!schema.Maps.length;
  }

  public normalizeObjectKeys<T>(obj: T) {
    return JSON.parse(
      JSON.stringify(obj).replace(/("\w+":)/g, (key: string) =>
        key.toUpperCase()
      )
    );
  }

  public wait(ms: number): Promise<void> {
    return new Promise((resolve) =>
      setTimeout(resolve, this.getRandomThrotle(ms))
    );
  }

  public writeJSON(entity: string, data: any, exception = false) {
    return Promise.all(
      this.chunkData(data).map((chunk: any) => {
        if (!this.counter[entity]) {
          this.counter[entity] = 0;
        }
        if (!exception) {
          this.counter[entity]++;
        }
        const number = `0000${this.counter[entity]}`.slice(-4);
        return new Promise<void>((resolve) => {
          this.loggerAdapter.log(
            "info",
            "WRITING JSON: ",
            `${process.cwd()}/output/${entity}-${number}.json`
          );
          return writeFile(
            `${process.cwd()}/output/${entity}-${number}.json`,
            JSON.stringify(chunk, null, 2),
            {},
            () => {
              this.loggerAdapter.log(
                "info",
                "WRITING JSON FILE DONE: ",
                `${process.cwd()}/output/${entity}-${number}.json`
              );
              resolve();
            }
          );
        });
      })
    );
  }

  private getRandomThrotle(min: number) {
    const max = min + 2500;
    const random = Math.random() * (max - min) + min;
    return Number(random.toFixed(0));
  }
}
