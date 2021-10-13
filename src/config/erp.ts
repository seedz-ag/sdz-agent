import chalk from "chalk";
import { ERPs } from "sdz-agent-types/enums/erps.enum";

const { Select } = require("enquirer");

export default async (erp?: ERPs): Promise<ERPs> => {
  const question = new Select({
    choices: ERPs,
    initial: erp,
    message: `What is your desired ${chalk.green(chalk.bold("ERP"))}?`,
  });

  return (await question.run()).response.toLowerCase();
};
