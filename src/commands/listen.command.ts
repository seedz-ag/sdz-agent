import { config } from "dotenv";
import { Readable } from "stream";
import { singleton } from "tsyringe";

import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { ICommand } from "../interfaces/command.interface";
import { ListenResponseCommand } from "./listen-response.command";
import { ListenExecuteCommand } from "./listen-execute.command";
import { ListenShellCommand } from "./listen-shell.command";
import { ListenQueryCommand } from "./listen-query.command";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { EnvironmentService } from "../services/environment.service";

config();

@singleton()
export class ListenCommand implements ICommand {
  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly executeCommand: ListenExecuteCommand,
    private readonly loggerAdapger: LoggerAdapter,
    private readonly queryCommand: ListenQueryCommand,
    private readonly responseCommand: ListenResponseCommand,
    private readonly shellCommand: ListenShellCommand
  ) { }

  public execute() {
    return new Promise<void>(async (resolve, reject) => {
      this.loggerAdapger.log("info", "START LISTENING COMMANDS");
      const commands: any = {
        Execute: (args: any) => {
          this.environmentService.parse();
          return this.executeCommand.execute(args);
        },
        Ping: (message: any) => {
          // if (process.env.LOG_PING) this.loggerAdapger.log("info", message.args);
        },
        Query: (args: any) => {
          this.environmentService.parse();
          return this.queryCommand.execute(args);
        },
        Response: (args: any) => this.loggerAdapger.log("info", args),
        Shell: (args: any) => this.shellCommand.execute(args),
      };

      const httpAdapter = new HttpClientAdapter();
      const headers = {
        Authorization: `Basic ${Buffer.from(
          `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
        ).toString("base64")}`,
      };
      try {
        this.loggerAdapger.log("info", "STREAM OPEN");
        const stream = await httpAdapter.get<Readable>(
          `${process.env.API_URL}commands`,
          {
            headers,
            responseType: "stream",
            timeout: 2_147_483_647,
          }
        );

        const heavyCommands = ["Execute", "Query"];

        stream.on("data", async (data: Buffer) => {
          let command: string | undefined;
          try {
            const message = JSON.parse(data.toString());
            command = message.command;
            const { arguments: args = [], sender } = message;

            if (!command || !commands[command]) {
              this.loggerAdapger.log("warn", `UNKNOWN COMMAND: ${command}`);
              return;
            }

            const result = await commands[command]({ args });

            if (!["Ping", "Response"].includes(command)) {
              await this.responseCommand.execute({ args: [result], channel: sender });
            }

            if (heavyCommands.includes(command)) {
              this.loggerAdapger.log("info", `${command} DONE, EXITING FOR MEMORY RECYCLE`);
              stream.destroy();
              resolve();
            }
          } catch (error) {
            this.loggerAdapger.log("error", "COMMAND ERROR", error);
            if (command && heavyCommands.includes(command)) {
              stream.destroy();
              reject(error);
            }
          }
        });

        stream.on("error", async (error: any) => {
          this.loggerAdapger.log("error", "STREAM ERROR", error);
          stream.destroy();
          reject(error);
        });

        stream.on("end", async () => {
          this.loggerAdapger.log("info", "STREAM CLOSED");
          resolve();
        });
      } catch (e: any) {
        this.loggerAdapger.log(
          "info",
          `STREAM CLOSED ${e.response.status} - ${e.response.statusText}`
        );
        reject(e);
      }
    });
  }
}
