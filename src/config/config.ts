import chalk from "chalk";
import fs from "fs";

import connector from "./connector";
import database from "./database";
import ftp from "./ftp";
import schedule from "./schedule";
import scope from "./scope";
import stubs from "./stubs";

const log = (msg: string) => console.log(chalk.green(msg));

const config = async () => {
  const answers: any = {
    ftp: {},
  };

  log("SEEDZ INTEGRATION AGENT");
  log("YOU WILL WALK THROUGH SOME CONFIGURATIONS STEPS");
  log("");

  answers.ftp = await ftp();

  const scopeAnswers = await scope();
  answers.scope = scopeAnswers.scope;

  const connectorType =  await connector();
  let dtoType = "";

  switch (connectorType) {
    case "database": {
      answers.database = await database();
      dtoType = answers.database.driver;
    }
  }

  answers.schedule = await schedule();

  stubs(scopeAnswers.scopeType, connectorType, dtoType, scopeAnswers.scope.map(item => item.name));

  fs.writeFileSync(`${__dirname}/../../config.json`, JSON.stringify(answers, null, "\t"))
};

!(async () => {
  await config();
})();
