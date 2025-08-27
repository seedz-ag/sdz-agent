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
  private extractBucketConfig(setting: ISetting): string | undefined {
    const bucketParam = setting.Parameters.find(({ Key }) => Key === "AMAZON_S3_RAW_BUCKET");
    return bucketParam?.Value;
  }

  private async upload(resource: string, data: unknown[]) {
    const bucket = this.extractBucketConfig(this.setting);
    
    const hasBufferData = data.some(item => item instanceof Buffer);
    if (hasBufferData) {
      const resourceSplited = resource.split('/');
      const resourcePath = resourceSplited[0];
      const fileData = data.find(item => item instanceof Buffer) as Buffer;
      const fileExtension = this.getFileExtension(resource);
      const fileName = this.getFileName(resource);

      this.loggerAdapter.log(
        "info",
        `UPLOAD FTP FILE TO ${bucket} - ${this.setting.TenantId}/${this.setting.Id}/${resourcePath}/${moment().format(
          "YYYY-MM-DD"
        )}/${fileName}`
      );

      return this.s3.putObject({
        Body: fileData,
        Bucket: bucket,
        Key: `${this.setting.TenantId}/${this.setting.Id}/${resourcePath}/${moment().format(
          "YYYY-MM-DD"
        )}/${fileName}`,
        ContentType: this.getContentType(fileExtension)
      });
    }

    this.loggerAdapter.log(
      "info",
      `SENDING ${data.length} LINES/FILE TO /${resource}`
    );

    for (const chunk of this.utilsService.chunkData(data)) {
      this.loggerAdapter.log(
        "info",
        `SENDING CHUNK ${chunk.length} LINES TO /${resource}`
      );

      await this.s3.putObject({
        Body: JSON.stringify(chunk),
        Bucket: bucket,
        Key: `${this.setting.TenantId}/${this.setting.Id}/${resource}/${moment().format(
          "YYYY-MM-DD"
        )}/${randomUUID()}.json`,
      });
    }
  }

  private getFileExtension(resource: string): string {
    if (resource.includes('.')) {
      const lastDotIndex = resource.lastIndexOf('.');
      return resource.substring(lastDotIndex);
    }
    return '.txt';
  }

  private getFileName(resource: string): string {
    if (resource.includes('/')) {
      const lastSlashIndex = resource.lastIndexOf('/');
      return resource.substring(lastSlashIndex + 1);
    }
    return resource;
  }

  private getContentType(extension: string): string {
    // Map common file extensions to MIME types
    const mimeTypes: { [key: string]: string } = {
      '.txt': 'text/plain',
      '.csv': 'text/csv',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.pdf': 'application/pdf',
      '.zip': 'application/zip'
    };

    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  public async send(resource: string, data: unknown[], ftp = false): Promise<void> {
    this.loggerAdapter.log(
      "info",
      `SENDING ${data.length} LINES/FILE TO /${resource}`
    );

    if (!this.setting) {
      this.setting = await this.apiService.getSetting();
    }

    await this.upload(resource, data);

    await this.utilsService.wait(this.environmentService.get("THROTTLE"));
  }
}
