import Database from "sdz-agent-database";
import fs from "fs";
import { DateTime } from "luxon";
import { singleton } from "tsyringe";
import { EnvironmentService } from "../services/environment.service";
import { HydratorService } from "../services/hydrator.service";
import { UtilsService } from "../services/utils.service";
import { IConsumer } from "../interfaces/consumer.interface";
import { ISetting } from "../interfaces/setting.interface";
import { ITransport } from "../interfaces/transport.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";

@singleton()
export class DatabaseConsumer implements IConsumer {
  private setting: ISetting;
  private transport: ITransport;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly hydratorService: HydratorService,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {}

  public async consume() {
    this.loggerAdapter.log("info", `CONNETING TO DATABASE`);
    const database = new Database(
      this.utilsService.extractDatabaseConfig(this.setting.Parameters)
    );
    const respository: any = database.getRepository();
    this.loggerAdapter.log("info", `DATABASE CONNECTED`);

    if (
      ["all", "datasource"].includes(
        String(this.environmentService.get("TYPE"))
      )
    ) {
      this.loggerAdapter.log("info", `EXECUTING DATABASE CHECK`);
      await respository.execute("SELECT 1");
      this.loggerAdapter.log("info", `DATABASE CHECK DONE`);
      return;
    }

    const lastExtraction = String(
      this.utilsService.findParameter(
        this.setting.Parameters,
        "LAST_EXTRACTION"
      )
    );

    if (lastExtraction) {
      this.loggerAdapter.log(
        "info",
        `SETTING LAST_EXTRACTION ${lastExtraction}`
      );
    }

    const days =
      Number(this.environmentService.get("EXTRACT_LAST_N_DAYS")) ||
      Number(
        Math.ceil(
          Math.abs(
            DateTime.now().diff(
              DateTime.fromFormat(lastExtraction, "yyyy-LL-dd"),
              "days"
            ).days
          )
        )
      );

    this.loggerAdapter.log("info", `RESOLVED EXTRACTION N DAYS: ${days}`);

    process.argv.push(`--sqlDays=${days}`);

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
        this.setting.Parameters.find(({ Key }) => "PAGE_SIZE" === Key)?.Value ||
        1000;

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

        let response = await respository.execute(sql.Command, page, limit);

        this.loggerAdapter.log("info", `SQL QUERY DONE`);

        while (response && response.length) {
          const data = !this.utilsService.needsToHydrate(schema)
            ? response
            : response.map((row: Record<string, string>) =>
                this.hydratorService.hydrate(schema.Maps, row)
              );

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

          await Promise.all([
            this.utilsService.writeJSON(
              schema.ApiResource || schema.Entity,
              data
            ),
            this.transport.send(schema.ApiResource || schema.Entity, data),
          ]);

          await this.utilsService.wait(this.environmentService.get("THROTTLE"));

          page++;

          response = await respository.execute(sql.Command, page, limit);
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
