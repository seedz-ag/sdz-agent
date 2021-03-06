import chalk from "chalk";
import enquirer from "enquirer";

import { Config, QuestionResponse } from "sdz-agent-types";

export default async (
  name: Config["name"] = "default",
  configNameList: (string | undefined)[],
  addConfig: boolean
) => {
  const answers: Partial<Config> = {};

  const prompt = enquirer.prompt<QuestionResponse>({
    type: "input",
    name: "response",
    initial: name,
    message: `What is your config ${chalk.green(chalk.bold("name"))}?`,
    validate: (value) => {
      if (addConfig && configNameList.includes(value)) {
        return "This config name already exists";
      }

      if (!addConfig && value !== name) {
        configNameList.push(value);
      }

      if (
        configNameList.filter((configName) => configName === value).length > 1
      ) {
        return "This config name already exists in another config";
      }

      return true;
    },
  });

  answers.name = (await prompt).response as string;
  return answers.name;
};
