import colors from "colors";
import { prompt } from "enquirer";
import { existsSync, writeFileSync } from "fs";
import { singleton } from "tsyringe";
import { HttpClientAdapter } from "../adapters/http-client.adapter";
import { ICommand } from "../interfaces/command.interface";

type CredentialsType = {
  CLIENT_ID: string;
  CLIENT_SECRET: string;
};

type ValidateCredentialsInput = CredentialsType;

@singleton()
export class ConfigureCommand implements ICommand {
  constructor(private readonly httpClientAdapter: HttpClientAdapter) {}

  private async askForCredentials(): Promise<CredentialsType> {
    const { CLIENT_ID, CLIENT_SECRET } = await prompt<{
      CLIENT_ID: string;
      CLIENT_SECRET: string;
    }>([
      {
        type: "input",
        name: "CLIENT_ID",
        message: "WHAT'S YOUR CLIENT ID?",
      },
      {
        type: "password",
        name: "CLIENT_SECRET",
        message: "WHAT'S YOUR CLIENT SECRET?",
      },
    ]);

    const validCredentials = await this.validateCredentials({
      CLIENT_ID,
      CLIENT_SECRET,
    });

    if (!validCredentials) {
      console.log(
        colors.magenta(`✖`),
        colors.white.bold(`INVALID CREDENTIALS`)
      );
      return await this.askForCredentials();
    }

    return { CLIENT_ID, CLIENT_SECRET };
  }

  private async validateCredentials({
    CLIENT_ID,
    CLIENT_SECRET,
  }: ValidateCredentialsInput): Promise<boolean> {
    try {
      await this.httpClientAdapter.post(`https://api.integration.seedz.ag/integration/v1/auth`, {
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      });
      return true;
    } catch {
      return false;
    }
  }

  public async execute() {
    try {
      if (existsSync(".env")) {
        const { CONTINUE } = (await prompt({
          type: "confirm",
          name: "CONTINUE",
          message: "YOUR AGENT SEENS TO BE CONFIGURED, OVERWRITE?",
        })) as any;

        if (!CONTINUE) {
          process.exit(1)
        }
      }

      // const { API_URL } = await prompt<{ API_URL: string }>({
      //   choices: [
      //     {
      //       name: "Development",
      //       value: "https://api-dev.integration.seedz.ag/integration/v1/",
      //     },
      //     {
      //       name: "Sandbox",
      //       value: "https://api-snd.integration.seedz.ag/integration/v1/",
      //     },
      //     {
      //       name: "Production",
      //       value: "https://api.integration.seedz.ag/integration/v1/",
      //     },
      //   ],
      //   name: "API_URL",
      //   message: "WHAT'S THE DESIRED API ENVIRONMENT?",
      //   type: "select",
      // });

      const { CLIENT_ID, CLIENT_SECRET } = await this.askForCredentials();

       writeFileSync(
        ".env",
        `API_URL=${`https://api.integration.seedz.ag/integration/v1/`}
CLIENT_ID=${CLIENT_ID}
CLIENT_SECRET=${CLIENT_SECRET}`
      );

      console.log(colors.green(`✔`), colors.bold(`PRODUCTION CONFIGURATION SAVED.`));
      process.exit(1)
    } catch {
      console.log(colors.magenta(`✖`), colors.bold(`CONFIGURATION CANCELLED.`));
      process.exit(1)
    }
  }
}
