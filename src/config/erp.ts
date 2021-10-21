import chalk from "chalk";
import  { ERPs }  from "sdz-agent-types";

const { Select } = require("enquirer");

export default async (erp?: ERPs): Promise<ERPs> => {
  const question = new Select({
    choices: [ERPs.Linx, ERPs.Protheus],
    initial: erp,
    message: `What is your desired ${chalk.green(chalk.bold("ERP"))}?`,
  });

  const response = await question.run();
  return response.toLowerCase();
};
