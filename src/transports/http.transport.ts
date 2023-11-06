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
    private readonly environtmentService: EnvironmentService,
    private readonly utilsService: UtilsService,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

  public async send(resource: string, data: unknown[]): Promise<void> {
    if (
      this.environtmentService.get("RAW_ONLY") &&
      !resource.startsWith("raw")
    ) {
      return;
    }

    this.loggerAdapter.log(
      "info",
      `SENDING ${data.length} LINES TO /${resource}`
    );

    for (const chunk of this.utilsService.chunkData(data)) {
      this.loggerAdapter.log(
        "info",
        `SENDING CHUNK ${chunk.length} LINES TO /${resource}`
      );
      await this.apiService.sendResource(resource, chunk);
    }
  }
}
