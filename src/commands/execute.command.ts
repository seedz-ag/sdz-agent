import { config } from "dotenv";
import fs from "fs";
import glob from "fast-glob";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { ISetting } from "../interfaces/setting.interface";
import HttpTransport from "../transports/http.transport";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { APIService } from "../services/api.service";
import { ConsumerResolverService } from "../services/consumer-resolver.service";
import { VPNService } from "../services/vpn.service";
import { EnvironmentService } from "../services/environment.service";

config();

process.on("SIGTERM", () => {
  glob("./output/*.log").then((paths: string[]) =>
    paths.forEach(fs.unlinkSync)
  );
  process.exit();
});

@singleton()
export class ExecuteCommand implements ICommand {
  constructor(
    private readonly apiService: APIService,
    private readonly consumerResolverService: ConsumerResolverService,
    private readonly environmentService: EnvironmentService,
    private readonly httpTransport: HttpTransport,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly vpnService: VPNService
  ) {}

  public async execute() {
    try {
      const env = this.environmentService.get("ENV");

      if (env) {
        this.environmentService.setDiscovery(await this.apiService.discovery());
        this.environmentService.parse();
      }

      this.loggerAdapter.log("info", "STARTING EXECUTE COMMAND");

      //CLEAR OLD FILES
      this.loggerAdapter.log("info", "CLEANING CSV FILES");
      await glob("./output/*.csv").then((paths: string[]) =>
        paths.forEach(fs.unlinkSync)
      );
      this.loggerAdapter.log("info", "CLEANING JSON FILES");
      await glob("./output/*.json").then((paths: string[]) =>
        paths.forEach(fs.unlinkSync)
      );
      this.loggerAdapter.log("info", "CLEANING SQL FILES");
      await glob("./output/*.sql").then((paths: string[]) =>
        paths.forEach(fs.unlinkSync)
      );
      this.loggerAdapter.log("info", "CLEANING OVPN FILES");
      await glob("./output/*.ovpn").then((paths: string[]) =>
        paths.forEach(fs.unlinkSync)
      );
      await glob("./output/*.txt").then((paths: string[]) =>
        paths.forEach(fs.unlinkSync)
      );

      let setting: ISetting | undefined;

      try {
        setting = await this.apiService.getSetting();
      } catch (e: any) {
        this.loggerAdapter.log(
          "error",
          `SDZ-AGENT ERROR WHILING FIND SETTING:`,
          e.response.data
        );
      }

      if (!setting) {
        throw new Error("SDZ-AGENT COULDN'T FIND SETTING, ABORTING.");
      }

      if (setting.Security) {
        this.loggerAdapter.log("info", "CONNECTING TO VPN.");
        this.vpnService.configure(setting.Security);
        await this.vpnService.connect();
      }

      this.loggerAdapter.log(
        "info",
        `RESOLVING TRANSPORT: ${setting.Channel.toUpperCase()}`
      );
      const transports: Record<string, any> = {
        AGENT: this.httpTransport,
        SAAS: this.httpTransport,
      };

      const transport = transports[setting.Channel.toUpperCase()];
      if (!transport) {
        throw new Error("TRANSPORT NOT FOUND");
      }
      this.loggerAdapter.log("info", `TRANSPORT RESOLVED`);

      const consumer = this.consumerResolverService.resolve(setting.DataSource);

      consumer.setSetting(setting);
      consumer.setTransport(transport);
      this.loggerAdapter.log("info", `STARTING CONSUMER`);
      await consumer.consume();
      this.loggerAdapter.log("info", `CONSUMER DONE`);
      await this.apiService.touchSetting();

      this.loggerAdapter.log("info", "ENDING PROCESS");

      if (this.vpnService.isConnected()) {
        await this.vpnService.disconnect();
      }
    } catch (error: any) {
      throw error;
    }
  }
}
