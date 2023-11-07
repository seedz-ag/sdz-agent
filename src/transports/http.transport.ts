import { singleton } from "tsyringe";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { ITransport } from "../interfaces/transport.interface";
import { APIService } from "../services/api.service";
import { EnvironmentService } from "../services/environment.service";
import { UtilsService } from "../services/utils.service";

@singleton()
export default class HttpTransport implements ITransport {
  constructor(
    private readonly apiService: APIService,
    private readonly environmentService: EnvironmentService,
    private readonly utilsService: UtilsService,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

  public async send(resource: string, data: unknown[]): Promise<void> {
    this.loggerAdapter.log(
      "info",
      `SENDING ${data.length} LINES TO /${resource}`
    );

    const promises: Promise<any>[] = [];

    for (const chunk of this.utilsService.chunkData(data)) {
      this.loggerAdapter.log(
        "info",
        `SENDING CHUNK ${chunk.length} LINES TO /${resource}`
      );
      promises.push(this.apiService.sendResource(resource, chunk));
    }

    if (this.environmentService.get("THROTTLE")) {
      await promises.reduce(async (acc: any, curr: any) => {
        await acc;
        await this.utilsService.wait(this.environmentService.get("THROTTLE"));
        return curr;
      }, promises);
      return;
    }

    await Promise.all(promises);
  }
}
