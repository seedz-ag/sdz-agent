import { singleton } from "tsyringe";
import { ExecuteCommand } from "./execute.command";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { UtilsService } from "../services/utils.service";

export type ListenExecuteCommandExecuteInput = {
  args: { arg: string; value: string }[][];
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
