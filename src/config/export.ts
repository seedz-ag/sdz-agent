import chalk from "chalk";

const { Select } = require("enquirer");

export default async (config: boolean | undefined) => {
  const question = new Select({
    choices: ["Async (Higher Resource use)", "Sync (Lower Resource use)"],
    name: "response",
    initial: 'undefined' === typeof config || config ? "Async (Higher Resource use)" : "Sync (Lower Resource use)",
    message: `What is your desired ${chalk.green(chalk.bold("EXPORT"))} mode?`,
  });
  return "Async (Higher Resource use)" === await question.run();
};
