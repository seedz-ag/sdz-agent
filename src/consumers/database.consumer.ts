import fs from "fs";
import { singleton } from "tsyringe";
import { EnvironmentService } from "../services/environment.service";
import { HydratorService } from "../services/hydrator.service";
import { UtilsService } from "../services/utils.service";
import { IConsumer } from "../interfaces/consumer.interface";
import { ISetting } from "../interfaces/setting.interface";
import { ITransport } from "../interfaces/transport.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { DatabaseAdapter } from "../adapters/database.adapter";

@singleton()
export class DatabaseConsumer implements IConsumer {
  private setting: ISetting;
  private transport: ITransport;

  constructor(
    private readonly databaseAdapter: DatabaseAdapter,
    private readonly environmentService: EnvironmentService,
    private readonly hydratorService: HydratorService,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) { }

  public async consume() {
    this.loggerAdapter.log("info", `CONNETING TO DATABASE`);

    const config = this.utilsService.extractDatabaseConfig(this.setting.Parameters);

    const driver: any = (this.setting.Parameters.find(({ Key }) => "DATABASE_DRIVER" === Key)?.Value)?.toLocaleUpperCase()

    if (!driver) {
      this.loggerAdapter.log("error", `DATABASE DRIVER NOT FOUND`);
      return
    }
    await this.databaseAdapter.initialize(driver.toLocaleUpperCase(), config, this.setting.Parameters);

    this.loggerAdapter.log("info", `DATABASE CONNECTED`);

    if (
      ["all", "datasource"].includes(
        String(this.environmentService.get("TYPE"))
      )
    ) {
      this.loggerAdapter.log("info", `EXECUTING DATABASE CHECK`);
      await this.databaseAdapter.checkConnection();
      this.loggerAdapter.log("info", `DATABASE CHECK DONE`);
      return;
    }

    const scope = this.environmentService.get("SCHEMA");

    if (scope) {
      this.loggerAdapter.log(
        "info",
        `RUNNING EXTRACTION ONLY FOR SCHEMA: ${scope}`
      );
    }
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

      this.loggerAdapter.log(
        "info",
        `CONSUMING ${schema.Entity.toLocaleUpperCase()}`
      );

      const queries = this.setting.Queries.filter(
        ({ Entity }) => schema.Entity === Entity
      );

      if (!queries.length) {
        this.loggerAdapter.log("error", "SQL NOT FOUND");
        throw new Error();
      }

      const file = `${process.cwd()}/output/${schema.Entity}`;

      const limit =
        Number(this.setting.Parameters.find(({ Key }) => "PAGE_SIZE" === Key)?.Value ||
          1000);

      for (const index in queries) {
        const sql = queries[index];
        let page = 0;
        fs.writeFileSync(`${file}-${index}.sql`, sql.Command);

        if (this.utilsService.needsToHydrate(schema)) {
          this.loggerAdapter.log(
            "info",
            `DATA FOR: ${schema.Entity.toLocaleUpperCase()} WILL BE TRANFORMED USING SCHEMA MAPS`
          );
        }

        this.loggerAdapter.log(
          "info",
          `EXECUTE SQL QUERY WITH LIMIT: ${limit}`
        );

        let response = await this.databaseAdapter.query(sql.Command, page, limit);

        this.loggerAdapter.log("info", `SQL QUERY DONE`);

        while (response && response.length) {
          const data = !this.utilsService.needsToHydrate(schema)
            ? response
            : response.map((row: Record<string, string>) =>
              this.hydratorService.hydrate(schema.Maps, row)
            );

          if (this.setting.Channel !== "SAAS_S3") {
            await Promise.all([
              this.utilsService.writeJSON(
                `raw-${schema.ApiResource || schema.Entity}`,
                response
              ),
              this.transport.send(
                `raw/${schema.ApiResource || schema.Entity}`,
                response
              ),
            ]);

            await this.utilsService.wait(this.environmentService.get("THROTTLE"));
          }

          await Promise.all([
            this.utilsService.writeJSON(
              schema.ApiResource || schema.Entity,
              data
            ),
            this.transport.send(schema.ApiResource || schema.Entity, data),
          ]);

          await this.utilsService.wait(this.environmentService.get("THROTTLE"));

          page++;
          response = await this.databaseAdapter.query(sql.Command, page, limit);
        }
      }
    }
  }

  public setSetting(setting: ISetting): this {
    this.setting = setting;
    return this;
  }

  public setTransport(transport: ITransport<any, void>): this {
    this.transport = transport;
    return this;
  }
}
