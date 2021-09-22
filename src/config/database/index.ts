import chalk from "chalk";
import informix from "./informix";

const { Select } = require("enquirer");

export default async () => {
  const question = new Select({
    choices: ["informix"],
    name: "response",
    message: `What is your desired ${chalk.green(chalk.bold("DATABASE"))} connector?`,
  });
  const response = await question.run();

  switch (response) {
	  case "informix":
      return { driver: "informix", ...await informix() };
  }
};
