import chalk from "chalk";
import enquirer from "enquirer";
import { ConfigAuthAPI, QuestionResponse } from "sdz-agent-types";

export default async (config: ConfigAuthAPI | undefined) => {
  const answers: Partial<ConfigAuthAPI> = {};

  answers.username = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.username,
      message: `What is your ${chalk.green(chalk.bold("API"))} username?`,
    })
  ).response as string;

  answers.password = (
    await enquirer.prompt<QuestionResponse>({
      type: "password",
      name: "response",
      initial: config?.password,
      message: `What is your ${chalk.green(chalk.bold("API"))} password?`,
    })
  ).response as string;

  return answers;
};
