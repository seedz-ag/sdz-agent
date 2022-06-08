import chalk from "chalk";

const { Select } = require("enquirer");

export default async () => {
  // const answers: { [key: string]: any } = {};
  const question = new Select({
    choices: ["database", "http"],
    name: "response",
    message: `What is your desired ${chalk.green(
      chalk.bold("CONNECTOR")
    )} type?`,
  });
  const response = await question.run();
  return response;
};
