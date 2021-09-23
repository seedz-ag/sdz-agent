import chalk from "chalk";
import enquirer from "enquirer";
import { ConfigAuthFTP, QuestionResponse } from "sdz-agent-types";

export default async () => {
  const answers: Partial<ConfigAuthFTP> = {};

  answers.host = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: "ftps.seedz.ag",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} host?`,
    })
  ).response as string;

  answers.port = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: "22",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} port?`,
    })
  ).response as number;

  answers.username = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} username?`,
    })
  ).response as string;

  answers.password = (
    await enquirer.prompt<QuestionResponse>({
      type: "password",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} password?`,
    })
  ).response as string;

  return answers;
};
