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
    return this.s3.putObject({
      Body: JSON.stringify(chunk),
      Bucket: this.environmentService.get("AMAZON_S3_RAW_BUCKET"),
      Key: `${this.setting.TenantId}/${resource}/${moment().format(
        "YYYY-mm-dd"
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

    const promises: Promise<any>[] = [];

    for (const chunk of this.utilsService.chunkData(data)) {
      this.loggerAdapter.log(
        "info",
        `SENDING CHUNK ${chunk.length} LINES TO /${resource}`
      );

      if (this.environmentService.get("THROTTLE")) {
        await this.upload(resource, chunk);
        await this.utilsService.wait(this.environmentService.get("THROTTLE"));
        continue;
      }

      promises.push(this.upload(resource, chunk));
    }

    await Promise.all(promises);
  }
}
