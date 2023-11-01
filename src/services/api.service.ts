import { randomUUID } from "node:crypto";
import { singleton } from "tsyringe";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { EnvironmentService } from "./environment.service";
import { IDiscovery } from "../interfaces/discovery.interface";
import { ISetting } from "../interfaces/setting.interface";

@singleton()
export class APIService {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

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

  public async discovery() {
    this.loggerAdapter.log("info", "DISCOVERING");
    return this.httpClientAdapter.get<IDiscovery>(
      `${this.environmentService.get("API_URL")}discovery`,
      {
        headers: this.getHeaders(),
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
        timeout: 60000,
      }
    );
    if (!setting) {
      this.loggerAdapter.log("error", "SETTING NOT FOUND");
      throw new Error();
    }
    this.loggerAdapter.log("info", "SETTING ACQUIRED");
    return setting;
  }

  public async sendResource(resource: string, data: unknown) {
    this.loggerAdapter.log(
      "info",
      `SENDING RESOURCE ${this.environmentService.get("API_URL")}${resource}`
    );
    await this.httpClientAdapter.post(
      `${this.environmentService.get("API_URL")}${resource}`,
      data,
      {
        headers: this.getHeaders(),
      }
    );
  }

  public async touchSetting() {
    this.loggerAdapter.log(
      "info",
      `TOUCH SETTING ${this.environmentService.get("API_URL")}settings`
    );
    await this.httpClientAdapter.patch(
      `${this.environmentService.get("API_URL")}settings`,
      {},
      {
        headers: this.getHeaders(),
      }
    );
  }

  public async sendLog(log: string[][]) {
    await this.httpClientAdapter.post(
      `${this.environmentService.get("API_URL")}logs`,
      log,
      {
        headers: this.getHeaders(),
        timeout: 5000,
      }
    );
  }
}
