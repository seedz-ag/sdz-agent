import chalk from "chalk";
import enquirer from "enquirer";

export default async () => {
  const answers: { [key: string]: any } = {};
  await enquirer
    .prompt({
      type: "input",
      name: "response",
      initial: "ftps.seedz.ag",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} host?`,
    })
    .then((answer) => (answers.host = answer));

  await enquirer
    .prompt({
      type: "input",
      name: "response",
      initial: "22",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} port?`,
    })
    .then((answer) => (answers.port = answer));

  await enquirer
    .prompt({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} username?`,
    })
    .then((answer) => (answers.username = answer));

  await enquirer
    .prompt({
      type: "password",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("FTP"))} password?`,
    })
    .then((answer) => (answers.password = answer));
  return answers;
};
