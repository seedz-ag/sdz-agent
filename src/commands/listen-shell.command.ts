import { exec } from "child_process";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";

export type ListenShellCommandExecuteInput = {
  args: string[];
};

@singleton()
export class ListenShellCommand
  implements ICommand<ListenShellCommandExecuteInput, string | void>
{
  constructor(private readonly loggerAdapter: LoggerAdapter) {}

  public async execute({
    args,
  }: ListenShellCommandExecuteInput): Promise<string | void> {
    try {
      return await new Promise<string>(async (resolve, reject) => {
        const command = args.pop();
        if (!command) {
          reject("Command is Required.");
          return;
        }
        exec(command, (error, stdout, stderr) => {
          if (error && stderr) {
            resolve(stderr);
          }
          resolve(stdout);
        });
      });
    } catch (error: any) {
      await this.rescue(error);
    }
  }

  public async rescue(error: Error) {
    this.loggerAdapter.log("error", error.message, error.stack);
    throw error;
  }
}
