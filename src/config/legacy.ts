import chalk from "chalk";

const { Select } = require("enquirer");

export default async () => {
  const question = new Select({
    choices: ["Legacy", "Latest"],
    name: "response",
    initial: "Latest",
    message: `What is your desired ${chalk.green(chalk.bold("FORMAT"))} mode?`,
  });
  return "Legacy" === await question.run();
};
