import chalk from "chalk";
const { Select } = require("enquirer");

export default async () => {
  const question = new Select({
    choices: ["yes", "no"],
    name: "response",
    message: `New ${chalk.green(chalk.bold("config"))}?`,
  });

  const response = await question.run();

  return response === "yes" ? true : false;
};
