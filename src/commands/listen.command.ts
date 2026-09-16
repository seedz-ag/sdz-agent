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
import { EnvironmentService } from "../services/environment.service";
import { IdleTimer } from "../services/idle-timer.service";

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

      /**
       * Idle shutdown — only when asked for.
       *
       * Absent by default: an installed agent runs `listen` permanently, and an
       * implicit TTL would bring every one of them down. The flag exists for the
       * SAAS console session, which comes up for an investigation and must die
       * on its own if the operator closes the tab.
       */
      const ttl = Number(this.environmentService.get("SESSION_TTL") ?? 0);
      let idle: IdleTimer | undefined;
      let closingByTtl = false;

      const httpAdapter = new HttpClientAdapter();
      const headers = {
        Authorization: `Basic ${Buffer.from(
          `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
        ).toString("base64")}`,
      };
      try {
        this.loggerAdapger.log("info", "STREAM OPEN");
        const stream = await httpAdapter.get<Stream>(
          `${process.env.API_URL}commands`,
          {
            headers,
            responseType: "stream",
            timeout: 2_147_483_647,
          }
        );

        if (ttl > 0) {
          idle = new IdleTimer({
            minutes: ttl,
            onExpire: (ocioso) => {
              closingByTtl = true;
              this.loggerAdapger.log(
                "info",
                `IDLE FOR ${Math.round(ocioso / 1000)}s WITH TTL ${ttl}m — CLOSING SESSION`
              );
              // Close the stream so the CLI exits through its normal path
              // instead of dying mid-flight.
              (stream as any).destroy?.();
              resolve();
            },
          }).start();

          this.loggerAdapger.log("info", `SESSION TTL ${ttl}m`);
        }

        stream.on("data", async (data: Buffer) => {
          const message = JSON.parse(data.toString());
          const { arguments: args = [], command, sender } = message;

          /**
           * The clock only resets on an effective command.
           *
           * The API sends `Ping` every 30s. Resetting on it would keep the TTL
           * from ever firing — a forgotten session would stay alive forever,
           * which is exactly what this is here to prevent.
           */
          idle?.touch(command);

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
          idle?.stop();
          // A stream that drops after the TTL is not a failure: it is the exit we asked for.
          if (closingByTtl) {
            this.loggerAdapger.log("info", "SESSION CLOSED BY TTL");
            resolve();
            return;
          }
          this.loggerAdapger.log("error", error);
          reject(error);
        });

        stream.on("end", async () => {
          idle?.stop();
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
