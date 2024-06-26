import { writeFileSync } from "fs";
import { Writable } from "node:stream";
import { singleton } from "tsyringe";
import { IConsumer } from "../interfaces/consumer.interface";
import { ISetting } from "../interfaces/setting.interface";
import { ITransport } from "../interfaces/transport.interface";
import { FTPAdapter, FTPAdapterConfig } from "../adapters/ftp.adapter";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { EnvironmentService } from "../services/environment.service";
import { UtilsService } from "../services/utils.service";

@singleton()
export class FTPConsumer implements IConsumer {
  private setting: ISetting;
  private transport: ITransport;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly ftpAdapter: FTPAdapter,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {}

  private extractFTPConfig(setting: ISetting): FTPAdapterConfig {
    return setting.Parameters.filter(({ Key }) =>
      Key.startsWith("FTP_")
    ).reduce<Record<string, string>>((previous, current) => {
      previous[current.Key.replace("FTP_", "").toLowerCase()] = current.Value;
      return previous;
    }, {}) as unknown as FTPAdapterConfig;
  }

  public async consume(): Promise<void> {
    if (
      ["all", "datasource"].includes(
        String(this.environmentService.get("TYPE"))
      )
    ) {
      await this.ftpAdapter.connect();
      return;
    }
    const scope = this.environmentService.get("SCHEMA");

    for (const schema of this.setting.Schemas) {
      if (scope && schema.Entity !== scope) {
        continue;
      }
      if (
        "AGENT" !== schema.InputFormat &&
        this.utilsService.hasAgentSchemaForCurrentEntity(
          this.setting.Schemas,
          schema.Entity
        )
      ) {
        continue;
      }

      if (!schema) {
        this.loggerAdapter.log("error", `COULDN'T FIND SCHEMA`);
        throw new Error();
      }

      const query = this.setting.Queries.find(
        ({ Entity }) => schema.Entity === Entity
      );

      if (!query) {
        this.loggerAdapter.log("error", `COULDN'T FIND QUERY COMMAND`);
        throw new Error();
      }

      this.loggerAdapter.log(
        "info",
        `CONSUMING ${schema.Entity.toLocaleUpperCase()}`
      );

      writeFileSync(
        `${process.cwd()}/output/${schema.Entity.toLocaleLowerCase()}.json`,
        JSON.stringify(query)
      );

      const files = await this.ftpAdapter.list(query.Command);

      await Promise.all(
        files.map((file) => {
          return new Promise(async (resolve) => {
            let data: Buffer = Buffer.from("");
            const stream = new Writable();
            stream.on("pipe", (chunk: Buffer) => {
              data = Buffer.concat([data, chunk]);
            });
            stream.on("close", async () => {
              resolve(this.transport.send(schema.ApiResource, data));
            });
            await this.ftpAdapter.getFile(
              `${query.Command}${file.name}`,
              stream
            );
          });
        })
      );
    }
  }

  public setSetting(setting: ISetting): this {
    this.ftpAdapter.setConfig(this.extractFTPConfig(setting));
    return this;
  }

  public setTransport(transport: ITransport) {
    this.transport = transport;
    return this;
  }
}
