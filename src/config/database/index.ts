import chalk from "chalk";
import { ConfigDatabase } from "sdz-agent-types/types/config.type";
import informix from "./informix";

const { Select } = require("enquirer");

export default async (config: ConfigDatabase | undefined) => {
  const question = new Select({
    choices: ["informix"],
    name: "response",
    initial: config?.driver,
    message: `What is your desired ${chalk.green(chalk.bold("DATABASE"))} connector?`,
  });
  const response = await question.run();

  switch (response) {
	  case "informix":
      return { driver: "informix", ...await informix(config) };
  }
};
