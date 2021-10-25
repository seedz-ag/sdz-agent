import chalk from "chalk";
import fs from "fs";

import ConfigJson from "../../config";
import connector from "./connector";
import database from "./database";
import erp from "./erp";
import exportMode from "./export";
import ftp from "./ftp";
import api from "./api";
import legacyMode from "./legacy";
import schedule from "./schedule";
import scope from "./scope";
import stubs from "./stubs";

const log = (msg: string) => console.log(chalk.green(msg));

const config = async () => {
  const answers: any = {};

  log("SEEDZ INTEGRATION AGENT");
  log("YOU WILL WALK THROUGH SOME CONFIGURATIONS STEPS");
  log("");

  answers.legacy = true //await legacyMode(ConfigJson?.legacy);

  answers.async = false //await exportMode(ConfigJson?.async);

  answers.ftp = await ftp(ConfigJson?.ftp);
  
  if(answers.legacy)
  {
    answers.api = await api(ConfigJson?.api);
  }

  const scopeAnswers = await scope(ConfigJson?.scope);
  answers.scope = scopeAnswers.scope;

  const connectorType = await connector();
  let dtoType = "";

  answers.connector = connectorType;

  answers.erp = await erp(ConfigJson.erp);

  switch (connectorType) {
    
    case "database": {
      answers.database = await database(ConfigJson?.database, answers.erp);
      dtoType = answers.database.driver;
    }
  }

  answers.schedule = await schedule(ConfigJson?.schedule);

  stubs(
    answers.erp,
    connectorType,
    dtoType,
    scopeAnswers.scope.map((item: any) => item.name)
  );

  const dir = process.env.DOCKER ? `/docker/config.json` : `/config.json`;

  fs.writeFileSync(
    `${process.cwd()}${dir}`,
    JSON.stringify(answers, null, "\t")
  );


  log("");
  log("CONGRATULATIONS, CONFIGURATION COMPLETED!");
};

!(async () => {
  try {
    await config();
  } catch {}
})();
