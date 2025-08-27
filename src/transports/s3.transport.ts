import { S3 } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";
import moment from "moment";
import { singleton } from "tsyringe";

import { LoggerAdapter } from "../adapters/logger.adapter";
import { ITransport } from "../interfaces/transport.interface";
import { APIService } from "../services/api.service";
import { EnvironmentService } from "../services/environment.service";
import { UtilsService } from "../services/utils.service";
import { ISetting } from "../interfaces/setting.interface";

@singleton()
export default class S3Transport implements ITransport {
  private s3: S3;

  private setting: ISetting;

  constructor(
    private readonly apiService: APIService,
    private readonly environmentService: EnvironmentService,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {
    this.s3 = new S3({
      credentials: {
        accessKeyId: String(environmentService.get("AMAZON_ACCESS_KEY")),
        secretAccessKey: String(
          environmentService.get("AMAZON_ACCESS_SECRET_KEY")
        ),
      },
      region: environmentService.get("AMAZON_REGION"),
    });
  }

  private upload(resource: string, chunk: unknown[]) {
    this.loggerAdapter.log(
      "info",
      `UPLOAD TO ${this.environmentService.get("AMAZON_S3_RAW_BUCKET")} - ${this.setting.TenantId}/${this.setting.Id}/${resource}/${moment().format(
        "YYYY-MM-DD"
      )}/${randomUUID()}.json`
    );
    return this.s3.putObject({
      Body: JSON.stringify(chunk),
      Bucket: this.environmentService.get("AMAZON_S3_RAW_BUCKET"),
      Key: `${this.setting.TenantId}/${this.setting.Id}/${resource}/${moment().format(
        "YYYY-MM-DD"
      )}/${randomUUID()}.json`,
    });
  }

  public async send(resource: string, data: unknown[]): Promise<void> {
    this.loggerAdapter.log(
      "info",
      `SENDING ${data.length} LINES TO /${resource}`
    );

    if (!this.setting) {
      this.setting = await this.apiService.getSetting();
    }

      this.loggerAdapter.log(
        "info",
        `SENDING CHUNK ${data.length} LINES TO /${resource}`
      );

      await this.upload(resource, data);

      await this.utilsService.wait(this.environmentService.get("THROTTLE"));
    }
  }
