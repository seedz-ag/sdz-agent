import chalk from "chalk";
import enquirer from "enquirer";
import { QuestionResponse } from "sdz-agent-types";
import { Config }from "sdz-agent-types";

const validate = (value: string): string | boolean  => {
	const cleared = value.replace(/[0-9\/\*]/g, '');
	if (cleared.length > 0) {
		return 'Invalid input.';
	}
	return true; 
}

export default async (config: Config["schedule"] | undefined) => {
  const answers: { [key: string]: string | number } = {};
  answers.hour = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.hour || "*",
      message: `What is your desired ${chalk.green(chalk.bold("SCHEDULE"))} hour?`,
      validate,
    })
    .then((answer) => answer.response);
  answers.minute = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: config?.minute || "*",
      message: `What is your desired ${chalk.green(chalk.bold("SCHEDULE"))} minute?`,
      validate,
    })
    .then((answer) => answer.response);
  return answers;
};
