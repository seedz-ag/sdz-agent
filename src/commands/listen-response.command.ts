import { config } from "dotenv";
import { singleton } from "tsyringe";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { HttpClientAdapter } from "../adapters/http-client.adapter";

config();

export type ListenResponseCommandExecuteInput = {
  args: any[];
  channel: string;
};

@singleton()
export class ListenResponseCommand
  implements ICommand<ListenResponseCommandExecuteInput>
{
  constructor(
    private readonly httpClientAdapter: HttpClientAdapter,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

  public async execute({ channel, args }: ListenResponseCommandExecuteInput) {
    try {
      await this.httpClientAdapter.post(
        `${process.env.API_URL}commands`,
        {
          arguments: args,
          channel,
          command: "Response",
        },
        {
          headers: {
            Authorization: `Basic ${Buffer.from(
              `${process.env.CLIENT_ID}:${process.env.CLIENT_SECRET}`
            ).toString("base64")}`,
            "Content-Type": "application/json",
          },
        }
      );
    } catch (error: any) {
      this.rescue(error);
    }
  }

  public async rescue(error: Error) {
    this.loggerAdapter.log("error", error.message, error.stack);
    throw error;
  }
}
