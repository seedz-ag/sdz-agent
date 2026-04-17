import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readdirSync, statSync, unlinkSync } from "fs";
import { singleton } from "tsyringe";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { EnvironmentService } from "./environment.service";
import { IDiscovery } from "../interfaces/discovery.interface";
import { ISetting } from "../interfaces/setting.interface";
import { UtilsService } from "./utils.service";

@singleton()
export class APIService {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) { }

  private getHeaders() {
    return {
      Authorization: `Basic ${Buffer.from(
        `${this.environmentService.get(
          "CLIENT_ID"
        )}:${this.environmentService.get("CLIENT_SECRET")}`
      ).toString("base64")}`,
      "sdz-request-id": randomUUID(),
    };
  }

  private getHeadersLogs() {
    return {
      Authorization: `Basic ${Buffer.from(
        `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
      ).toString("base64")}`,
      "sdz-request-id": randomUUID(),
    };
  }

  public async discovery() {
    this.loggerAdapter.log("info", "DISCOVERING");
    return this.httpClientAdapter.get<IDiscovery>(
      `${this.environmentService.get("API_URL")}discovery`,
      {
        headers: this.getHeaders(),
        timeout: this.environmentService.get("API_REQUEST_TIMEOUT"),
      }
    );
  }

  public async getSetting() {
    this.loggerAdapter.log(
      "info",
      `ENVIRONMENT ${this.environmentService.get("API_URL")}`
    );
    this.loggerAdapter.log("info", "GETTING SETTING");
    const setting = await this.httpClientAdapter.get<ISetting>(
      `${this.environmentService.get("API_URL")}settings`,
      {
        headers: this.getHeaders(),
        timeout: this.environmentService.get('API_REQUEST_TIMEOUT'),
      }
    );
    if (!setting) {
      this.loggerAdapter.log("error", "SETTING NOT FOUND");
      throw new Error();
    }
    this.loggerAdapter.log("info", "SETTING ACQUIRED");
    return setting;
  }

  public async sendResource(
    resource: string,
    data: unknown,
    tries = 1
  ): Promise<void> {
    this.loggerAdapter.log(
      "info",
      `TRYING(${tries}) TO SEND RESOURCE ${this.environmentService.get(
        "API_URL"
      )}${resource}`
    );

    try {
      await this.httpClientAdapter.post(
        `${this.environmentService.get("API_URL")}${resource}`,
        data,
        {
          headers: this.getHeaders(),
          timeout: this.environmentService.get('API_REQUEST_TIMEOUT')
        }
      );
    } catch (error: any) {
      this.loggerAdapter.log(
        "error",
        `TRYING(${tries}) TO SEND RESOURCE ${this.environmentService.get(
          "API_URL"
        )}${resource} - ${this.formatRequestError(error)}`
      );
      if (tries <= this.environmentService.get("RETRIES")) {
        await this.utilsService.wait(
          this.utilsService.calculateRetryTime(tries, 60_000)
        );
        tries++;
        return await this.sendResource(resource, data, tries);
      }
      throw error;
    }
  }

  public async touchSetting() {
    this.loggerAdapter.log(
      "info",
      `TOUCH SETTING ${this.environmentService.get("API_URL")}settings`
    );
    try {
      await this.httpClientAdapter.patch(
        `${this.environmentService.get("API_URL")}settings`,
        {},
        {
          headers: this.getHeaders(),
          timeout: this.environmentService.get('API_REQUEST_TIMEOUT'),
        }
      );
    } catch (error: any) {
      this.loggerAdapter.log(
        "error",
        `TOUCH SETTING ${this.environmentService.get("API_URL")}settings - ${this.formatRequestError(error)}`
      );
    }
  }

  private formatRequestError(error: any): string {
    const status = error?.response?.status;
    const statusText = error?.response?.statusText;
    const data = error?.response?.data;
    const hasData =
      data !== undefined &&
      data !== null &&
      !(typeof data === "object" && Object.keys(data).length === 0) &&
      !(typeof data === "string" && data.trim() === "");
    const dataStr = hasData
      ? typeof data === "object"
        ? JSON.stringify(data)
        : String(data)
      : "";
    const parts = [
      status ? `status=${status}` : "",
      statusText ? `statusText=${statusText}` : "",
      error?.code ? `code=${error.code}` : "",
      dataStr ? `data=${dataStr}` : "",
      !hasData && error?.message ? `message=${error.message}` : "",
    ].filter(Boolean);
    return parts.length ? parts.join(" ") : "unknown error";
  }

  private fileLoggingEnabled = false;

  public enableFileLogging(): void {
    mkdirSync("./logs", { recursive: true });
    this.cleanOldLogs();
    this.fileLoggingEnabled = true;
  }

  private cleanOldLogs(): void {
    try {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      readdirSync("./logs")
        .filter((f) => f.startsWith("agent-") && f.endsWith(".log"))
        .forEach((f) => {
          const filePath = `./logs/${f}`;
          if (statSync(filePath).mtimeMs < cutoff) unlinkSync(filePath);
        });
    } catch {
      // silently ignore
    }
  }

  private writeLogsToFile(log: string[][]): void {
    if (!this.fileLoggingEnabled) return;
    try {
      const date = new Date().toISOString().slice(0, 10);
      const lines = log.map((entry) => JSON.stringify(entry)).join("\n") + "\n";
      appendFileSync(`./logs/agent-${date}.log`, lines, "utf8");
    } catch {
      // não bloqueia o fluxo principal se a escrita falhar
    }
  }

  public async sendLog(log: string[][]): Promise<boolean> {
    this.writeLogsToFile(log);

    const ENV =
      process.env.CLIENT_ID !== this.environmentService.get("CLIENT_ID")
        ? "SND"
        : false;

    try {
      await this.httpClientAdapter.post(
        `${process.env.API_URL}logs`,
        (!ENV && log) ||
        log.map((data) => [
          data[0],
          data[1],
          ENV ? `[${ENV}] - ${data[2]}` : `${data[2]}`,
          ...data.slice(3),
        ]),
        {
          headers: this.getHeadersLogs(),
          timeout: this.environmentService.get("API_REQUEST_TIMEOUT"),
        }
      );
      return true;
    } catch (e: any) {
      this.loggerAdapter.log(
        "error",
        `ERROR ${process.env.API_URL}logs ${e?.response?.data || ""}`
      );
      return false;
    }
  }
}