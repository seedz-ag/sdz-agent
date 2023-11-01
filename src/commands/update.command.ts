import { exec } from "child_process";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";

@singleton()
export class UpdateCommand implements ICommand {
  public async execute() {
    await new Promise((resolve, reject) =>
      exec("git pull", (error, stdout, stderr) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(true);
      })
    );
  }
}
