import { config } from "dotenv";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { DatabaseAdapter } from "../adapters/database.adapter";
import { singleton } from "tsyringe";

import { ICommand } from "../interfaces/command.interface";
import { ISetting } from "../interfaces/setting.interface";
import { APIService } from "../services/api.service";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { UtilsService } from "../services/utils.service";

config();

type ListenQueryCommandExecuteInput = {
  args: string[];
};

@singleton()
export class ListenQueryCommand
  implements ICommand<ListenQueryCommandExecuteInput, any> {
  constructor(
    private readonly apiService: APIService,
    private readonly databaseAdapter: DatabaseAdapter,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService


  ) { }

  public async execute({ args }: ListenQueryCommandExecuteInput) {
    this.loggerAdapter.log("info", "command", args[0]);

    let setting: ISetting | undefined;
    try {
      setting = await this.apiService.getSetting();
    } catch { }

    const setingDatabase = setting?.Parameters.filter(({ Key }) =>
      Key.startsWith("DATABASE_")
    ).reduce((previous, current) => {
      previous[current.Key.replace(/DATABASE_/, "").toLowerCase()] =
        current.Value;
      return previous;
    }, {} as Record<string, string>) as unknown as ConfigDatabaseInterface;

    if (setingDatabase && setting) {
      const driver: any = (setting?.Parameters.find(({ Key }) => "DATABASE_DRIVER" === Key)?.Value)?.toLocaleUpperCase()
      const config = setting ? this.utilsService.extractDatabaseConfig(setting.Parameters) : null
      if (!driver || !config) {
        this.loggerAdapter.log("error", `DATABASE DRIVER NOT FOUND`);
        return
      }
      await this.databaseAdapter.initialize(driver.toLocaleUpperCase(), config, setting.Parameters);
      const result = await this.databaseAdapter.execute(args[0])
      this.loggerAdapter.log("info", result);
      return result;
    }
  }

}
