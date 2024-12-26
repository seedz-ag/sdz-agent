import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { ISetting } from "../interfaces/setting.interface";
import { ListenCommand } from "./listen.command";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { APIService } from "../services/api.service";
import { EnvironmentService } from "../services/environment.service";
import { getContainer } from "../container";
import { ExecuteCommand } from "./execute.command";
import { gracefulShutdown, scheduleJob } from "node-schedule";
import { APILoggerAdapter } from "../adapters/api-logger.adapter";
import { ConsoleLoggerAdapter } from "../adapters/console-logger.adapter";

@singleton()
export class SchedulerCommand implements ICommand {
  private interval: NodeJS.Timeout;

  constructor(
    private readonly apiService: APIService,
    private readonly environtmentService: EnvironmentService,
    private readonly listenCommand: ListenCommand,
    private readonly loggerAdapter: LoggerAdapter,
  ) {
    process.on("SIGTERM", () => {
      this.loggerAdapter.log("info", "STOPING SCHEDULER");
    });
  }

  private async schedule(cronExpression: string) {
    const container = await getContainer();
    const executeCommand = container.resolve(ExecuteCommand);
    const apiLoggerAdapter = container.resolve(APILoggerAdapter);
    const consoleLoggerAdapter = container.resolve(ConsoleLoggerAdapter);
    const loggerAdapter = container.resolve(LoggerAdapter);
    loggerAdapter.pipe(consoleLoggerAdapter);
    loggerAdapter.pipe(apiLoggerAdapter);

    loggerAdapter.log(`info`, `SCHEDULING JOB AT ${cronExpression}`);
    return scheduleJob(cronExpression, async () => {
      try {
        return await executeCommand.execute();
      } catch (e) {
        return false;
      }
    });
  }

  public async execute() {
    try {
      await new Promise<void>(async (resolve, reject) => {
        this.loggerAdapter.log("info", "STARTING SCHEDULER");

        const jobs = [];

        let setting: ISetting;

        try {
          setting = await this.apiService.getSetting();
        } catch (error) {
          reject(error);
          return;
        }

        for (const { CronExpression } of setting.Schedules) {
          jobs.push(this.schedule(CronExpression));
        }

        if ("true" === process.env.LISTEN) {
          this.listenCommand.execute();
        }

        this.interval = setInterval(async () => {
          try {
            const verify = await this.apiService.getSetting();
            if (JSON.stringify(setting) !== JSON.stringify(verify)) {
              setting = verify;
              await gracefulShutdown();
            }
          } catch (error) {
            reject(error);
          }
        }, 60_000);
      });
    } catch (error) {
      clearInterval(this.interval);
      await this.rescue();
    }
  }

  public async rescue() {
    if (this.environtmentService.get("FOREVER")) {
      await this.execute();
    }
  }
}