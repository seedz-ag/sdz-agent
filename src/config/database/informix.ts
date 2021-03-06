import chalk from "chalk";
import enquirer from "enquirer";
import fs from "fs";
import { QuestionResponse } from "sdz-agent-types";
import { Config } from "sdz-agent-types";

export const createSQLHosts = ({ host, port, server }: { [key: string]: any }) => {
  let INFORMIXDIR = `${process.cwd()}/node_modules/informixdb/installer/onedb-odbc-driver`;
  if (process.env.INFORMIXDIR) {
    INFORMIXDIR = process.env.INFORMIXDIR;
  }
  fs.writeFileSync(
    `${INFORMIXDIR}/etc/sqlhosts`,
    `${server} onsoctcp ${host} ${port}`
  );
};

export default async (config: Config["database"] | undefined) => {
  const answers: { [key: string]: any } = {};

  answers.locale = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.locale || "en_US.UTF8",
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} locale?`,
    })
    .then((answer) => answer.response);

  answers.host = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.host,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} host?`,
    })
    .then((answer) => answer.response);

  answers.port = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.port,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} port?`,
    })
    .then((answer) => answer.response);

  answers.server = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.server,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} server?`,
    })
    .then((answer) => answer.response);

  answers.schema = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.schema,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} schema?`,
    })
    .then((answer) => answer.response);

  answers.username = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.username,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} username?`,
    })
    .then((answer) => answer.response);

  answers.password = await enquirer
    .prompt<QuestionResponse>({
      type: "password",
      name: "response",
      initial: config?.password,
      message: `What is your ${chalk.green(chalk.bold("INFORMIX"))} password?`,
    })
    .then((answer) => answer.response);
  createSQLHosts(answers);
  return answers;
};
