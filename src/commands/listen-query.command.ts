import { config } from "dotenv";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { DatabaseAdapter } from "../adapters/database.adapter";
import { singleton } from "tsyringe";

import { ICommand } from "../interfaces/command.interface";
import { ISetting } from "../interfaces/setting.interface";
import { APIService } from "../services/api.service";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { UtilsService } from "../services/utils.service";
import { EnvironmentService } from "../services/environment.service";

config();

type ListenQueryCommandExecuteInput = {
  args: { arg: string; value: string }[][];
};

@singleton()
export class ListenQueryCommand
  implements ICommand<ListenQueryCommandExecuteInput, any> {
  constructor(
    private readonly apiService: APIService,
    private readonly databaseAdapter: DatabaseAdapter,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService,
    private readonly environmentService: EnvironmentService
  ) { }

  public async execute({ args }: ListenQueryCommandExecuteInput) {
    this.loggerAdapter.log("info", "command", `${JSON.stringify(args)}`);

    if (Array.isArray(args) && args.length) {
      args.forEach((args) => {
        this.utilsService.mergeEnv(
          args.reduce<Record<string, string>>((previous, current) => {
            const { arg, value } = current;
            if (arg) {
              const key = arg.replace(/(--|\=)/g, "");
              previous[key] = value && value.trim();
            }
            return previous;
          }, {})
        );
      });
    }

    const env: any = this.environmentService.get("ENV") || 'DEV';
    this.utilsService.mergeEnv(env);

    if (Array.isArray(args) && args.length) {
      args.forEach((args) => {
        this.utilsService.mergeEnv(
          args.reduce<Record<string, string>>((previous, current) => {
            const { arg, value } = current;
            if (arg) {
              const key = arg.replace(/(--|\=)/g, "");
              previous[key] = value && value.trim();
            }
            return previous;
          }, {})
        );
      });
    }


    if (env !== 'DEV') {
      this.environmentService.setDiscovery(await this.apiService.discovery());
      this.environmentService.parse();
    }

    const command = args.pop() as any;
    const query = command.filter((query: any) => {
      return query.label === 'query'
    });

    if (!command || !query.length || !query[0].value) {
      this.loggerAdapter.log("info", "Query is Required");
      return ("Query is Required.");
    }

    const isValid = !query[0].value
      .toLocaleUpperCase()
      .split(' ')
      .some((word: string) => ['UPDATE ', 'INSERT ', 'DELETE '].includes(word));
    if (!isValid) return ('ERROR')

    let setting: ISetting | undefined;
    try {
      setting = await this.apiService.getSetting();
    } catch (e) {
      console.log(e)
      return e
    }

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
      const result = await this.databaseAdapter.executeQueryRemote(query[0].value)
      this.loggerAdapter.log("info", result);
      return result;
    }
  }

}
