import { singleton } from "tsyringe";
import { ExecuteCommand } from "./execute.command";
import { EnvironmentService } from "../services/environment.service";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { UtilsService } from "../services/utils.service";

export type ListenExecuteCommandExecuteInput = {
  args: string[];
};

@singleton()
export class ListenExecuteCommand
  implements ICommand<ListenExecuteCommandExecuteInput, boolean>
{
  constructor(
    private readonly executeCommand: ExecuteCommand,
    private readonly loggerAdapter: LoggerAdapter,
    private readonly utilsService: UtilsService
  ) {}

  public async execute({
    args,
  }: ListenExecuteCommandExecuteInput): Promise<boolean> {
    this.loggerAdapter.log("info", `COMMAND ${args}`);

    if (args) {
      this.utilsService.mergeEnv(
        args.reduce<Record<string, string>>((previous, current) => {
          const [key, value] = current.replace("--", "").split("=");
          previous[key.trim()] = value && value.trim();
          return previous;
        }, {})
      );
    }

    return new Promise(async (resolve, reject) => {
      try {
        await this.executeCommand.execute();
        resolve(true);
      } catch (e) {
        console.log(e);
        reject(e);
      }
    });
  }
}
