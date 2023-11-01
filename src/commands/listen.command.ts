import { config } from "dotenv";
import { Stream } from "stream";
import { singleton } from "tsyringe";

import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { ICommand } from "../interfaces/command.interface";
import { ListenResponseCommand } from "./listen-response.command";
import { ListenExecuteCommand } from "./listen-execute.command";
import { ListenShellCommand } from "./listen-shell.command";
import { ListenQueryCommand } from "./listen-query.command";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { LogsService } from "../services/logs.service";

config();

@singleton()
export class ListenCommand implements ICommand {
  constructor(
    private readonly executeCommand: ListenExecuteCommand,
    private readonly loggerAdapger: LoggerAdapter,
    private readonly logService: LogsService,
    private readonly queryCommand: ListenQueryCommand,
    private readonly responseCommand: ListenResponseCommand,
    private readonly shellCommand: ListenShellCommand
  ) {}

  public execute() {
    return new Promise<void>(async (resolve, reject) => {
      this.loggerAdapger.log("info", "START LISTENING COMMANDS");
      const commands: any = {
        Execute: (args: any) => this.executeCommand.execute(args),
        Ping: (message: any) => {
          // if (process.env.LOG_PING) this.loggerAdapger.log("info", message.args);
        },
        Query: (args: any) => this.queryCommand.execute(args),
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
        const stream = await httpAdapter.get<Stream>(
          `${process.env.API_URL}commands`,
          {
            headers,
            responseType: "stream",
            timeout: 2_147_483_647,
          }
        );

        stream.on("data", async (data: Buffer) => {
          const message = JSON.parse(data.toString());
          const { arguments: args = [], command, sender } = message;
          try {
            const result = await commands[command]({ args });
            !["Ping", "Response"].includes(command) &&
              this.responseCommand.execute({ args: [result], channel: sender });
          } catch (error) {
            this.loggerAdapger.log("error", error);
            reject(error);
          }
        });

        stream.on("error", async (error: any) => {
          this.loggerAdapger.log("error", error);
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
