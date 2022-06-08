import chalk from "chalk";
import enquirer from "enquirer";
import { Config, QuestionResponse } from "sdz-agent-types";

export default async (name: Config["name"] = 'default') => {
  const answers: Partial<Config> = {};

  answers.name = (
    await enquirer.prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: name,
      message: `What is your config ${chalk.green(chalk.bold("name"))}?`,
    })
  ).response as string;

  return answers.name;
};
