import chalk from "chalk";
import { ConfigDatabaseInterface, ERPs } from "sdz-agent-types";
import firebird from "./firebird";
import informix from "./informix";
import mssql from "./mssql";
import oracle from "./oracle";

const { Select } = require("enquirer");

export default async (config: ConfigDatabaseInterface| undefined, erp: ERPs) => {
  const available = {
    [ERPs.Agrotitan]: ["firebird"],
    [ERPs.Linx]: ["informix"],
    [ERPs.Protheus]: ["mssql", "oracle", "mysql"],
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
    case "firebird":
      return { driver: "firebird", ...(await firebird(config)) };
    case "informix":
      return { driver: "informix", ...(await informix(config)) };
    case "mysql":
      return { driver: "mysql", ...(await mssql(config)) };
    case "mssql":
      return { driver: "mssql", ...(await mssql(config)) };
    case "oracle":
      return { driver: "oracle", ...(await oracle(config)) };
  }
};
