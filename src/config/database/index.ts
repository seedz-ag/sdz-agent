import chalk from "chalk";
import { ConfigDatabaseInterface } from "sdz-agent-types";
import  { ERPs }  from "sdz-agent-types";
import informix from "./informix";
import oracle from "./oracle";

const { Select } = require("enquirer");

export default async (config: ConfigDatabaseInterface| undefined, erp: ERPs) => {
  const available = {
    [ERPs.Linx]: ["informix"],
    [ERPs.Protheus]: ["oracle"],
  };
  const question = new Select({
    choices: available[erp],
    name: "response",
    initial: config?.driver,
    message: `What is your desired ${chalk.green(
      chalk.bold("DATABASE")
    )} connector?`,
  });
  const response = await question.run();

  switch (response) {
    case "informix":
      return { driver: "informix", ...(await informix(config)) };
    case "oracle":
      return { driver: "oracle", ...(await oracle(config)) };
  }
};
