import chalk from "chalk";
import enquirer from "enquirer";
import { QuestionResponse } from "sdz-agent-types";

export default async () => {
  const answers: { [key: string]: any } = {};

  answers.locale = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: "en_US.UTF8",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} locale?`,
    })
    .then((answer) => answer.response);

  answers.host = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} host?`,
    })
    .then((answer) => answer.response);

  answers.port = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} port?`,
    })
    .then((answer) => answer.response);

  answers.server = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} server?`,
    })
    .then((answer) => answer.response);

  answers.schema = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} schema?`,
    })
    .then((answer) => answer.response);

  answers.username = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} username?`,
    })
    .then((answer) => answer.response);

  answers.password = await enquirer
    .prompt<QuestionResponse>({
      type: "password",
      name: "response",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} password?`,
    })
    .then((answer) => answer.response);
  return answers;
};
