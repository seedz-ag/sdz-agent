import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { ISetting, ISchedule } from "../interfaces/setting.interface";
import { ListenCommand } from "./listen.command";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { APIService } from "../services/api.service";
import { EnvironmentService } from "../services/environment.service";
import { UtilsService } from "../services/utils.service";

@singleton()
export class SchedulerCommand implements ICommand {
  constructor(
    private readonly apiService: APIService,
    private readonly environtmentService: EnvironmentService,
    private readonly listenCommand: ListenCommand,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {
    process.on("SIGTERM", () => {
      this.loggerAdapter.log("info", "STOPING SCHEDULER");
    });
  }

  private fork(schedules: ISchedule[]) {
    try {
      const child = this.utilsService.fork("./src/job");
      child.send(JSON.stringify(schedules));
      return child;
    } catch (error) {
      this.loggerAdapter.log("error", { error });
      this.fork(schedules);
    }
  }

  public async execute() {
    try {
      await new Promise<void>(async (resolve, reject) => {
        this.loggerAdapter.log("info", "STARTING SCHEDULER");
        let setting: ISetting = await this.apiService.getSetting();
        let child = this.fork(setting.Schedules);
        if ("true" === process.env.LISTEN) {
          this.listenCommand.execute();
        }
        setInterval(async () => {
          if (!child) {
            reject();
            return;
          }
          const verify = await this.apiService.getSetting();
          if (JSON.stringify(setting) !== JSON.stringify(verify)) {
            child.kill();
            setting = verify;
            child = this.fork(setting.Schedules);
          }
        }, 60000);
      });
    } catch (error) {
      await this.rescue();
    }
  }

  public async rescue() {
    if (this.environtmentService.get("FOREVER")) {
      await this.execute();
    }
  }
}