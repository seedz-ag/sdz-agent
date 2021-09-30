import chalk from "chalk";
import enquirer from "enquirer";
import { ConfigAuthFTP, QuestionResponse } from "sdz-agent-types";

export default async (config: ConfigAuthFTP | undefined) => {
  const answers: Partial<ConfigAuthFTP> = {};

  answers.host = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.host || "ftps.seedz.ag",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} host?`,
    })
  ).response as string;

  answers.port = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.port || "22",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} port?`,
    })
  ).response as number;

  answers.username = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.username,
      message: `What is your ${chalk.green(chalk.bold("FTP"))} username?`,
    })
  ).response as string;

  answers.password = (
    await enquirer.prompt<QuestionResponse>({
      type: "password",
      name: "response",
      initial: config?.password,
      message: `What is your ${chalk.green(chalk.bold("FTP"))} password?`,
    })
  ).response as string;

  return answers;
};
