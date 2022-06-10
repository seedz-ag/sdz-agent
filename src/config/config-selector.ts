import chalk from "chalk";
import { Config } from "sdz-agent-types";

const { Select } = require("enquirer");

export default async (
  configuration: Config | Config[] | undefined
): Promise<any> => {
  let name;
  let choices: string[] = [];
  if (configuration && Array.isArray(configuration) && configuration.length) {
    configuration.forEach((config: Config) => {
      if (
        !!config.name &&
        !choices.includes(config.name) &&
        choices.push(config.name)
      ) {
        name = config.name;
      }
    });
  } else {
    return "default";
  }

  const prompt1 = new Select({
    name: "response",
    message: `Which  ${chalk.green(chalk.bold("config"))} do you want to edit`,
    initial: "default",
    choices: choices,
    sort: true,
  });

  const namePrompt = await prompt1.run();
  return namePrompt;
};
