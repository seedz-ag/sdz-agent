import chalk from "chalk";
import fs from "fs";
import { QuestionResponse } from "sdz-agent-types";

const { prompt, Select } = require("enquirer");

const log = (msg: string) => console.log(chalk.green(msg));

const dtos = async () => {
  const dtos: any = {};

  /*
  log("SEEDZ INTEGRATION AGENT");
  log("YOU WILL WALK THROUGH SOME DTO CONFIGURATIONS STEPS");
  log("");
  */

  const files = fs.readdirSync(`${__dirname}/../../config/dto`);

  for (const file of files) {
    if (file.match(/.json$/)) {
      if (
        "yes" ===
        (await new Select({
          choices: ["yes", "no"],
          initial: "yes",
          message: `DO YOU WANT TO ALTER THE ${file} DTO FILE?`,
        }).run())
      ) {
        dtos[file] = await edit(file);
      }
    }
  }

  console.log(dtos);

  /*
  log("");
  log("CONGRATULATIONS, DTO CONFIGURATION COMPLETED!");
  */
};

const edit = async (file: string) => {
  const json = JSON.parse(
    fs.readFileSync(`${__dirname}/../../config/dto/${file}`).toString()
  );
  const ask = async (): Promise<
    { [key: string]: string | number } | undefined
  > => {
    const dto: { [key: string]: string | number } = {};

    log("");
    log(`LET'S STEP OVER ${file} FIELDS:`);

    for (const key of Object.keys(json)) {
      await prompt({
        initial: json[key],
        message: `DO YOU WANT THE PROPERTY ${key} TO BE MAPPED TO?`,
        name: "response",
        type: "input",
      }).then((answer: QuestionResponse) => (dto[key] = answer.response));
    }

    log(JSON.stringify(dto, null, "\t"));

    if (
      "no" ===
      (await new Select({
        choices: ["yes", "no"],
        initial: "yes",
        message: `IS YOUR MAP OF ${file} DTO FILE RIGHT?`,
      }).run())
    ) {
      return await ask();
    }

    return dto;
  };

  return await ask();
};

!(async () => {
  try {
    await dtos();
  } catch {}
})();
