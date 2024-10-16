import colors from "colors";
import { config } from "dotenv";
import NetworkSpeedCheck from "network-speed";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { APIService } from "../services/api.service";
import { ConsumerResolverService } from "../services/consumer-resolver.service";

config();

export type CheckCommandExecuteInput = {
  type: "all" | "auth" | "datasource" | "speed";
};

type ConnectionSpeed = { download: string; upload: string } | false;

export type CheckCommandExecuteOutput =
  | {
    type: "all";
    checkAuth: boolean;
    checkDataSource: boolean;
    checkConnectionSpeed: ConnectionSpeed;
  }
  | {
    type: "auth";
    checkAuth: boolean;
  }
  | {
    type: "datasource";
    checkDataSource: boolean;
  }
  | {
    type: "speed";
    checkConnectionSpeed: ConnectionSpeed;
  };

@singleton()
export class CheckCommand
  implements ICommand<CheckCommandExecuteInput, CheckCommandExecuteOutput> {
  constructor(
    private readonly apiService: APIService,
    private readonly consumerResolverService: ConsumerResolverService,
    private readonly httpClientAdapter: HttpClientAdapter
  ) { }

  private async checkAuth() {
    try {
      await this.httpClientAdapter.post(
        `${process.env.API_URL}auth`,
        {
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
        },
        { timeout: 1000 }
      );
      return true;
    } catch {
      return false;
    }
  }

  private async checkDataSource(): Promise<boolean> {
    try {
      const setting = await this.apiService.getSetting();
      const consumer = this.consumerResolverService.resolve(setting.DataSource);
      consumer.setSetting(setting);
      await consumer.consume();
      return true;
    } catch (error) {
      return false;
    }
  }

  private async checkConnectionSpeed(): Promise<{
    download: string;
    upload: string;
  }> {
    const testNetworkSpeed = new NetworkSpeedCheck();
    async function getNetworkDownloadSpeed() {
      const baseUrl = "https://eu.httpbin.org/stream-bytes/50000000";
      const fileSizeInBytes = 50000000;
      const speed = await testNetworkSpeed.checkDownloadSpeed(
        baseUrl,
        fileSizeInBytes
      );
      return speed;
    }
    async function getNetworkUploadSpeed() {
      const options = {
        hostname: "www.google.com",
        port: 80,
        path: "/catchers/544b09b4599c1d0200000289",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      };
      const fileSizeInBytes = 10000000;
      const speed = await testNetworkSpeed.checkUploadSpeed(
        options,
        fileSizeInBytes
      );
      return speed;
    }
    return {
      download: (await getNetworkDownloadSpeed()).mbps,
      upload: (await getNetworkUploadSpeed()).mbps,
    };
  }

  public async execute({
    type,
  }: CheckCommandExecuteInput): Promise<CheckCommandExecuteOutput> {
    const response: CheckCommandExecuteOutput = {
      checkAuth: false,
      checkDataSource: false,
      checkConnectionSpeed: false,
      type,
    };

    if ("all" === response.type || "auth" === response.type) {
      response.checkAuth = await this.checkAuth();
    }

    if (response.type === "all" || response.type === "datasource") {
      response.checkDataSource = await this.checkDataSource();
    }



    if (response.type === "all" || response.type === "speed") {
      try {
        const { download, upload } = await this.checkConnectionSpeed();
        response.checkConnectionSpeed = {
          download: download,
          upload: upload,
        };
      } catch { }
    }

    return response;
  }
}
