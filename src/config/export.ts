import chalk from "chalk";

const { Select } = require("enquirer");

export default async () => {
  const question = new Select({
    choices: ["Async (Higher Resource use)", "Sync (Lower Resource use)"],
    name: "response",
    initial: "Async (Higher Resource use)",
    message: `What is your desired ${chalk.green(chalk.bold("EXPORT"))} mode?`,
  });
  return "Async (Higher Resource use)" === await question.run();
};
