import chalk from "chalk";
import enquirer from "enquirer";
import { ConfigAuthOpenId, QuestionResponse } from "sdz-agent-types";

export default async () => {
  const answers: Partial<ConfigAuthOpenId> = {};

  answers.ISSUER_URL = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial:
        process.env.ISSUER_URL ||
        "https://sdz-ide-svc.seedz.ag/oidc/.well-known/openid-configuration",
      message: `What is your ${chalk.green(chalk.bold("Issuer"))} host?`,
    })
  ).response as string;

  answers.CLIENT_ID = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: process.env.CLIENT_ID,
      message: `What is your ${chalk.green(chalk.bold("Client ID"))}?`,
    })
  ).response as string;

  answers.CLIENT_SECRET = (
    await enquirer.prompt<QuestionResponse>({
      type: "password",
      name: "response",
      initial: process.env.CLIENT_SECRET,
      message: `What is your ${chalk.green(chalk.bold("Client Secret"))}?`,
    })
  ).response as string;

  answers.WS_SERVER_URL = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: process.env.WS_SERVER_URL || "wss://sdz-age-ws.seedz.ag/",
      message: `What is your ${chalk.green(chalk.bold("WS"))} host?`,
    })
  ).response as string;

  return answers;
};
