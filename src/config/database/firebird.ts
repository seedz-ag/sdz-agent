import chalk from "chalk";
import enquirer from "enquirer";
import { ConfigDatabaseInterface, QuestionResponse } from "sdz-agent-types";

export default async (config: ConfigDatabaseInterface | undefined) => {
  const answers: { [key: string]: any } = {};

  answers.host = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.host || "localhost",
      message: `What is your ${chalk.green(chalk.bold("Firebird"))} host?`,
    })
    .then((answer) => answer.response);

  answers.port = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.port || "3050",
      message: `What is your ${chalk.green(chalk.bold("Firebird"))} port?`,
    })
    .then((answer) => answer.response);

  answers.schema = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.schema,
      message: `What is your ${chalk.green(chalk.bold("Firebird"))} database?`,
    })
    .then((answer) => answer.response);

  answers.username = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.username,
      message: `What is your ${chalk.green(chalk.bold("Firebird"))} username?`,
    })
    .then((answer) => answer.response);

  answers.password = await enquirer
    .prompt<QuestionResponse>({
      type: "password",
      name: "response",
      initial: config?.password,
      message: `What is your ${chalk.green(chalk.bold("Firebird"))} password?`,
    })
    .then((answer) => answer.response);
  return answers;
};
