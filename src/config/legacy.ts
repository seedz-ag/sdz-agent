import chalk from "chalk";

const { Select } = require("enquirer");

export default async (config: boolean | undefined) => {

  const question = new Select({
    choices: [ "Legacy", "Latest" ],
    initial: config ? "Legacy" : "Latest",
    message: `What is your desired ${chalk.green(chalk.bold("FORMAT"))} mode?`,
  });

  return "Legacy" === await question.run();

};
