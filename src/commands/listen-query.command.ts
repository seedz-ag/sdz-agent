import { config } from "dotenv";
import Database from "sdz-agent-database";
import { ConfigDatabaseInterface } from "sdz-agent-types";
import { singleton } from "tsyringe";

import { ICommand } from "../interfaces/command.interface";
import { ISetting } from "../interfaces/setting.interface";
import { APIService } from "../services/api.service";
import { LoggerAdapter } from "../adapters/logger.adapter";

config();

type ListenQueryCommandExecuteInput = {
  args: string[];
};

@singleton()
export class ListenQueryCommand
  implements ICommand<ListenQueryCommandExecuteInput, any>
{
  constructor(
    private readonly apiService: APIService,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

  public async execute({ args }: ListenQueryCommandExecuteInput) {
    this.loggerAdapter.log("info", "command", args[0]);

    let setting: ISetting | undefined;
    try {
      setting = await this.apiService.getSetting();
    } catch {}

    const setingDatabase = setting?.Parameters.filter(({ Key }) =>
      Key.startsWith("DATABASE_")
    ).reduce((previous, current) => {
      previous[current.Key.replace(/DATABASE_/, "").toLowerCase()] =
        current.Value;
      return previous;
    }, {} as Record<string, string>) as unknown as ConfigDatabaseInterface;

    if (setingDatabase) {
      const database = new Database(setingDatabase);
      const result = await database.getConnector().execute(args[0]);
      this.loggerAdapter.log("info", result);
      return result;
    }
  }
}
