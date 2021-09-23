import chalk from "chalk";
import enquirer from "enquirer";
import { QuestionResponse } from "sdz-agent-types";

const validate = (value: string): string | boolean  => {
	const cleared = value.replace(/[0-9\/\*]/g, '');
	if (cleared.length > 0) {
		return 'Invalid input.';
	}
	return true; 
}

export default async () => {
  const answers: { [key: string]: any } = {};
  answers.hour = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: "*",
      message: `What is your desired ${chalk.green(chalk.bold("SCHEDULE"))} hour?`,
      validate,
    })
    .then((answer) => answer.response);
  answers.minute = await enquirer
    .prompt<QuestionResponse>({
      type: "input",
      name: "response",
      initial: "*",
      message: `What is your desired ${chalk.green(chalk.bold("SCHEDULE"))} minute?`,
      validate,
    })
    .then((answer) => answer.response);
  return answers;
};
