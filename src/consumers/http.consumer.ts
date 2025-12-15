import { get } from "dot-wild";
import fs from "fs";
import { singleton } from "tsyringe";
import parser from "xml2json";
import XmlStream from "xml-stream";
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
  private cache: Record<string, number> = {};
  private setting: ISetting;
  private transport: ITransport;

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly hydratorService: HydratorService,
    private readonly interpolationService: InterpolationService,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) { }

  // FUNCTIONS
  private compile(
    template: string,
    data: Record<string, any> = {},
    scope: any = {}
  ) {
    return this.interpolationService.interpolate(template, data, scope);
  }

  private compileBody(headers = {}, body: string, scope: any) {
    this.loggerAdapter.log("info", `COMPILE BODY`);
    if ("string" !== typeof body) {
      return JSON.parse(this.compile(JSON.stringify(body)), scope);
    }
    if (get(headers, "Content-Type") === "application/json") {
      return JSON.parse(this.compile(body), scope);
    }
    return this.compile(body, scope);
  }

  private async authenticate(authentication: any) {
    const {
      username,
      usernameKey = "username",
      password,
      passwordKey = "password",
      url,
      path,
      method = "POST",
    } = authentication;

    const requestCompiled = {
      data: {
        [usernameKey]: username,
        [passwordKey]: password,
      },
      method,
      url,
    };
    return this.httpClientAdapter.request(requestCompiled).then((data: any) => {
      if (!!path) {
        return get(data, path);
      }
      return data;
    });
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

  private handleRange(command: Record<string, any>) {
    if (command.range) {
      command.scope = {
        ...(command.scope || {}),
        current: String(command.range?.current?.value),
        end: String(command.range?.end?.value),
      };
    }

    if (command.range) {
      ["current", "end"].forEach((direction) => {
        if (command.range?.[direction]?.type) {
          switch (command.range?.[direction]?.type) {
            case "INT_DECREMENT":
              command.range[direction].value =
                Number(command.range[direction].value) -
                Number(command.range[direction].step);
              break;
            case "INT_INCREMENT":
              command.range[direction].value =
                Number(command.range[direction].value) +
                Number(command.range[direction].step);
              break;
            default:
              throw new Error("INVALID STEP TYPE");
          }
        }
      });
    }
  }

  private searchDataPath = (data: any, path: string) => {
    try {
      //this.loggerAdapter.log("info", `SEARCH DATA PATH`);
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
      // this.loggerAdapter.log("info", `DATA PATH FOUND`);
      return currentData || "";
    } catch (error) {
      this.loggerAdapter.log("error", error);
    }
  };

  private async request(
    schema: ISchema,
    request: any,
    tries = 1
  ): Promise<unknown[]> {
    const {
      body,
      dataPath,
      headers,
      method,
      scope = {},
      timeout,
      url,
      authentication,
    } = request;
    this.loggerAdapter.log("info", `GETTING RESOURCE`);
    const resource = await this.getResourceName(schema);
    if (!!authentication) {
      const token = await this.authenticate(authentication);
      scope.Authorization = token;
    }
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
      url: this.compile(url, scope),
    };

    this.loggerAdapter.log(
      "info",
      "REQUESTING",
      JSON.stringify(requestCompiled)
    );

    if (!this.cache[schema.Entity.toUpperCase()]) {
      this.cache[schema.Entity.toUpperCase()] = 0;
    }

    this.cache[schema.Entity.toUpperCase()]++;

    fs.writeFileSync(
      `${process.cwd()}/output/${schema.Entity.toLocaleLowerCase()}-request-${`0000${this.cache[schema.Entity.toUpperCase()]
        }`.slice(-5)}.json`,
      JSON.stringify(requestCompiled)
    );
    // Processar com streaming se useStream estiver habilitado
    if (request.useStream) {
      this.loggerAdapter.log("info", `USING STREAM MODE FOR ${resource}`);
      return await this.requestWithStream(schema, requestCompiled, dataPath, headers, resource, tries, request);
    }

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
      })
      .catch(async (error) => {
        this.loggerAdapter.log(
          "error",
          `TRYING(${tries}) TO REQUESTING ${resource}[${error?.response || ""}]`
        );
        if (tries <= (this.environmentService.get("RETRIES") || 3)) {
          await this.utilsService.wait(
            this.utilsService.calculateRetryTime(tries, 30_000)
          );
          return await this.request(schema, request, tries + 1);
        }
        throw error;
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
      const data = !this.utilsService.needsToHydrate(schema)
        ? response
        : response.map((row: Record<string, string>) =>
          this.hydratorService.hydrate(schema.Maps, row)
        );

      if (this.setting.Channel !== "SAAS_S3") {
        await Promise.all([
          this.utilsService.writeJSON(`raw-${resource}}`, response),
          this.transport.send(`raw/${resource}`, response),
        ]);


        await this.utilsService.wait(this.environmentService.get("THROTTLE"));

        if (this.environmentService.get("RAW_ONLY") && !resource.startsWith("raw")
        ) {
          this.loggerAdapter.log("warn", `SENDING EXTRACTION TO RAW ONLY`);
          return response;
        }
      }

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
        try {
          const query = queries[index];
          const command = JSON.parse(query.Command);
          this.interpolationService.setPage(0);
          fs.writeFileSync(
            `${process.cwd()}/output/${schema.Entity.toLocaleLowerCase()}-${query.Id
            }.json`,
            query.Command
          );

          this.handleRange(command);

          let response = await this.request(schema, command);

          const { range } = command;

          while ((response && response.length && command.paginates) || range) {
            if (range && String(range.current.value) === String(range.stop)) {
              break;
            }
            this.handleRange(command);
            response = await this.request(schema, command);
          }
        } catch (error) {
          this.loggerAdapter.log(
            "error",
            `CONSUMING ${schema.Entity.toLocaleUpperCase()}`
          );

          console.error({ error });
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

  private async requestWithStream(
    schema: ISchema,
    requestCompiled: any,
    dataPath: string | undefined,
    headers: any,
    resource: string,
    tries: number,
    originalRequest: any
  ): Promise<unknown[]> {
    try {
      const stream = await this.httpClientAdapter.requestStream(requestCompiled);
      return this.processXmlStream(stream, schema, dataPath, resource);
    } catch (error: any) {
      return this.handleStreamError(
        error,
        schema,
        requestCompiled,
        dataPath,
        headers,
        resource,
        tries,
        originalRequest
      );
    }
  }

  private processXmlStream(
    stream: NodeJS.ReadableStream,
    schema: ISchema,
    dataPath: string | undefined,
    resource: string
  ): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const results: any[] = [];
      let entryCount = 0;

      const xml = this.createXmlStream(stream);
      this.setupXmlStreamHandlers(xml, results, entryCount, schema, dataPath, resource, resolve, reject);
    });
  }

  private createXmlStream(stream: NodeJS.ReadableStream): any {
    const xml = new XmlStream(stream);
    xml.collect("content");
    xml.collect("m:properties");
    return xml;
  }

  private setupXmlStreamHandlers(
    xml: any,
    results: any[],
    entryCount: number,
    schema: ISchema,
    dataPath: string | undefined,
    resource: string,
    resolve: (value: unknown[]) => void,
    reject: (reason?: any) => void
  ): void {
    let currentEntryCount = entryCount;

    xml.on("endElement: entry", (entry: any) => {
      try {
        currentEntryCount++;
        const processedEntry = this.processEntry(entry, dataPath);

        if (processedEntry) {
          if (Array.isArray(processedEntry)) {
            results.push(...processedEntry);
          } else {
            results.push(processedEntry);
          }
        }

        if (currentEntryCount % 100 === 0) {
          this.loggerAdapter.log("info", `Processados ${currentEntryCount} entries via stream`);
        }
      } catch (error) {
        this.loggerAdapter.log("error", `Erro ao processar entry: ${error}`);
      }
    });

    xml.on("end", async () => {
      this.loggerAdapter.log("info", `Stream concluído: ${results.length} itens processados`);
      const finalResults = await this.processStreamResults(results, schema, resource);
      resolve(finalResults);
    });

    xml.on("error", (error: Error) => {
      this.loggerAdapter.log("error", `Erro no stream XML: ${error.message}`);
      reject(error);
    });
  }

  private processEntry(entry: any, dataPath: string | undefined): any {
    if (dataPath) {
      return this.extractDataWithPath(entry, dataPath);
    }
    return this.convertEntryToObject(entry);
  }

  private extractDataWithPath(entry: any, dataPath: string): any {
    const feedEntry = {
      feed: {
        entry: [entry]
      }
    };

    // Primeiro tenta usar o dataPath dinâmico exatamente como antes
    let result = this.searchDataPath(feedEntry, dataPath);

    // Se nada foi encontrado (resultado vazio), faz um fallback genérico
    // convertendo o entry para objeto "flat" compatível com o restante do fluxo.
    if (
      !result ||
      (Array.isArray(result) && result.length === 0) ||
      (!Array.isArray(result) && typeof result === "object" && !Object.keys(result || {}).length)
    ) {
      const converted = this.convertEntryToObject(entry);
      if (!converted || !Object.keys(converted).length) {
        return [];
      }
      return [converted];
    }

    return result;
  }

  private async processStreamResults(
    results: any[],
    schema: ISchema,
    resource: string
  ): Promise<unknown[]> {
    const normalizedResults = this.normalizeResults(results, resource);

    if (!normalizedResults || normalizedResults.length === 0) {
      return [];
    }

    // Process results em lotes grandes para evitar uso excessivo de memória
    const BATCH_SIZE = 10_000;
    const allHydrated: any[] = [];

    for (let start = 0; start < normalizedResults.length; start += BATCH_SIZE) {
      const batchRaw = normalizedResults.slice(start, start + BATCH_SIZE);
      const batchHydrated = this.applyHydration(batchRaw, schema);

      // Mantém compatibilidade retornando todos os registros hidratados
      allHydrated.push(...batchHydrated);

      // Envia e grava em lotes de até 10.000 registros
      await this.sendResults(batchHydrated, batchRaw, resource);
    }

    return allHydrated;
  }

  private normalizeResults(results: any[], resource: string): any[] {
    if (!Array.isArray(results)) {
      if (!results || !Object.keys(results).length) {
        this.loggerAdapter.log("info", `EMPTY: ${resource}`);
        return [];
      }
      return [results];
    }

    if (results.length === 0) {
      this.loggerAdapter.log("info", `EMPTY: ${resource}`);
      return [];
    }

    return results;
  }

  private applyHydration(results: any[], schema: ISchema): any[] {
    if (this.utilsService.needsToHydrate(schema)) {
      this.loggerAdapter.log(
        "info",
        `DATA FOR: ${schema.Entity.toLocaleUpperCase()} WILL BE TRANFORMED USING SCHEMA MAPS`
      );

      return results.map((row: Record<string, string>) =>
        this.hydratorService.hydrate(schema.Maps, row)
      );
    }

    return results;
  }

  private async sendResults(
    hydratedData: any[],
    rawResults: any[],
    resource: string
  ): Promise<void> {
    try {
      if (this.setting.Channel !== "SAAS_S3") {
        await Promise.all([
          this.utilsService.writeJSON(`raw-${resource}`, rawResults),
          this.transport.send(`raw/${resource}`, rawResults),
        ]);
        await this.utilsService.wait(this.environmentService.get("THROTTLE"));

        if (this.environmentService.get("RAW_ONLY") && !resource.startsWith("raw")) {
          this.loggerAdapter.log("warn", `SENDING EXTRACTION TO RAW ONLY`);
          return;
        }
      }

      await Promise.all([
        this.utilsService.writeJSON(resource, hydratedData),
        this.transport.send(resource, hydratedData),
      ]);
      await this.utilsService.wait(this.environmentService.get("THROTTLE"));
    } catch (error) {
      this.loggerAdapter.log("error", `Erro ao processar resultados: ${error}`);
      throw error;
    }
  }

  private async handleStreamError(
    error: any,
    schema: ISchema,
    requestCompiled: any,
    dataPath: string | undefined,
    headers: any,
    resource: string,
    tries: number,
    originalRequest: any
  ): Promise<unknown[]> {
    this.loggerAdapter.log(
      "error",
      `TRYING(${tries}) TO REQUESTING ${resource}[${error?.response || ""}]`
    );

    const maxRetries = this.environmentService.get("RETRIES") || 3;
    if (tries <= maxRetries) {
      await this.utilsService.wait(
        this.utilsService.calculateRetryTime(tries, 30_000)
      );

      return this.requestWithStream(
        schema,
        requestCompiled,
        dataPath,
        headers,
        resource,
        tries + 1,
        originalRequest
      );
    }

    throw error;
  }

  private convertEntryToObject(entry: any): any {
    // Converter o objeto entry do xml-stream para o formato esperado
    // Similar ao que o parser.toJson faz
    const result: any = {};

    // Processar content > m:properties > d:*
    if (entry.content) {
      const content = Array.isArray(entry.content) ? entry.content[0] : entry.content;
      if (content && content["m:properties"]) {
        const properties = Array.isArray(content["m:properties"])
          ? content["m:properties"][0]
          : content["m:properties"];

        for (const key in properties) {
          if (key.startsWith("$")) continue;
          const propKey = key.startsWith("d:") ? key.substring(2) : key;
          const propValue = properties[key];

          // Processar valores do xml-stream
          if (propValue && typeof propValue === "object") {
            if (propValue.$text !== undefined) {
              result[propKey.toUpperCase()] = propValue.$text;
            } else {
              result[propKey.toUpperCase()] = propValue;
            }
          } else {
            result[propKey.toUpperCase()] = propValue;
          }
        }
      }
    }

    // Processar outras propriedades do entry (id, title, etc.)
    for (const key in entry) {
      if (key === "content" || key.startsWith("$")) {
        continue;
      }

      const value = entry[key];
      if (value && typeof value === "object") {
        if (value.$text !== undefined) {
          result[key.toUpperCase()] = value.$text;
        } else if (Array.isArray(value) && value.length > 0 && value[0].$text !== undefined) {
          result[key.toUpperCase()] = value[0].$text;
        } else {
          result[key.toUpperCase()] = value;
        }
      } else {
        result[key.toUpperCase()] = value;
      }
    }

    return result;
  }
}