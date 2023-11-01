import { get } from "dot-wild";
import fs from "fs";
import { singleton } from "tsyringe";
import parser from "xml2json";
import { IConsumer } from "../interfaces/consumer.interface";
import { ISetting, ISchema } from "../interfaces/setting.interface";
import { ITransport } from "../interfaces/transport.interface";
import { EnvironmentService } from "../services/environment.service";
import { HydratorService } from "../services/hydrator.service";
import { InterpolationService } from "../services/interpolation.service";
import { UtilsService } from "../services/utils.service";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { LoggerAdapter } from "../adapters/logger.adapter";

@singleton()
export class HttpConsumer implements IConsumer {
  private setting: ISetting;
  private transport: ITransport;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly hydratorService: HydratorService,
    private readonly interpolationService: InterpolationService,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {}

  // FUNCTIONS
  private compile(template: string, data: Record<string, any> = {}) {
    return this.interpolationService.interpolate(template, data);
  }

  private compileBody(headers = {}, body: string, scope: any) {
    this.loggerAdapter.log("info", `COMPILE Body`);
    if (get(headers, "Content-Type") === "application/json") {
      return JSON.parse(this.compile(body), scope);
    }
    return this.compile(body, scope);
  }

  private getResourceName({
    ApiResource,
    Entity,
    InputFormat,
  }: ISchema): string {
    if ("JSON" === InputFormat) {
      return ApiResource;
    }

    const schema = this.setting.Schemas.find(
      (schema) => "JSON" === schema.InputFormat && Entity === schema.ApiResource
    );

    if (schema) {
      return schema.ApiResource;
    }

    return ApiResource || Entity;
  }

  private searchDataPath = (data: any, path: string) => {
    try {
      this.loggerAdapter.log("info", `SEARCH DATA PATH`);
      const dataPath = path.split(".");
      let key;
      let currentData = data;
      while ((key = dataPath.shift())) {
        currentData = get(
          currentData,
          key === "*" ? `${key}.${dataPath.shift()}` : key
        );
      }
      if (currentData) {
        currentData = (
          Array.isArray(currentData) ? currentData : [currentData]
        ).map((currentData) =>
          Object.keys(currentData).reduce((acc: any, key: string) => {
            acc[key.toUpperCase()] = currentData[key];
            return acc;
          }, {})
        );
      }
      this.loggerAdapter.log("info", `DATA PATH FOUND`);
      return currentData || "";
    } catch (error) {
      this.loggerAdapter.log("error", error);
    }
  };

  private async request(schema: ISchema, request: any): Promise<unknown[]> {
    const { body, dataPath, headers, method, scope, timeout, url } = request;
    this.loggerAdapter.log("info", `GETTING RESOURCE`);
    const resource = this.getResourceName(schema);

    this.loggerAdapter.log(
      "info",
      `RUNNING EXTRACTION FOR RESOURCE: ${resource}`
    );

    const requestCompiled = {
      data: body ? this.compileBody(headers, body, scope) : undefined,
      headers: headers
        ? JSON.parse(this.compile(JSON.stringify(headers), scope))
        : undefined,
      method,
      timeout,
      url: this.compile(url),
    };

    fs.writeFileSync(
      `${process.cwd()}/output/${schema.Entity.toLocaleLowerCase()}-request.json`,
      JSON.stringify(requestCompiled)
    );

    let response = await this.httpClientAdapter
      .request(requestCompiled)
      .then((data) => {
        if (get(headers, "Accept") === "application/xml") {
          return parser.toJson(data, { object: true });
        }
        return data;
      })
      .then((data) => {
        if (dataPath) {
          return this.searchDataPath(data, dataPath);
        }
        return data;
      });

    if (!Array.isArray(response)) {
      if (!Object.keys(response).length) {
        this.loggerAdapter.log("info", `EMPTY: ${resource}`);
        return [];
      }
      response = [response];
    } else if (!response.length) {
      this.loggerAdapter.log("info", `EMPTY: ${resource}`);
      return [];
    }

    if (this.utilsService.needsToHydrate(schema)) {
      this.loggerAdapter.log(
        "info",
        `DATA FOR: ${schema.Entity.toLocaleUpperCase()} WILL BE TRANFORMED USING SCHEMA MAPS`
      );
    }

    if (response && response.length) {
      const dto = schema.Maps.reduce((previous, current) => {
        previous[current.From] = current.To;
        return previous;
      }, {} as Record<string, string>);

      const data = this.utilsService.needsToHydrate(schema)
        ? response
        : response.map((row: Record<string, string>) =>
            this.hydratorService.hydrate(schema.Maps, row)
          );

      await Promise.all([
        this.utilsService.writeJSON(`raw-${resource}`, response),
        this.transport.send(`raw/${resource}`, response),
      ]);

      await this.utilsService.wait(this.environmentService.get("THROTTLE"));

      await Promise.all([
        this.utilsService.writeJSON(resource, data),
        this.transport.send(resource, data),
      ]);

      await this.utilsService.wait(this.environmentService.get("THROTTLE"));
    }

    return response;
  }

  public async consume(): Promise<void> {
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

      const queries = this.setting.Queries.filter(
        ({ Entity }) => schema.Entity === Entity
      );

      if (
        ["all", "datasource"].includes(
          String(this.environmentService.get("TYPE"))
        )
      ) {
        return;
      }

      this.loggerAdapter.log(
        "info",
        `HTTP REQUEST FOUND: ${schema.Entity.toUpperCase()}`
      );

      if (!queries.length) {
        this.loggerAdapter.log(
          "error",
          `COULDN'T FIND QUERY COMMAND ${schema.Entity.toUpperCase()}`
        );
        throw new Error();
      }

      this.loggerAdapter.log(
        "info",
        `CONSUMING ${schema.Entity.toLocaleUpperCase()}`
      );

      for (const index in queries) {
        const query = queries[index];
        const command = JSON.parse(query.Command);
        this.interpolationService.setPage(0);
        fs.writeFileSync(
          `${process.cwd()}/output/${schema.Entity.toLocaleLowerCase()}.json`,
          query.Command
        );
        let response = await this.request(schema, command);
        while (response && response.length && command.paginates) {
          response = await this.request(schema, command);
        }
      }
    }
  }

  public setSetting(setting: ISetting): this {
    this.setting = setting;
    return this;
  }

  public setTransport(transport: ITransport): this {
    this.transport = transport;
    return this;
  }
}
