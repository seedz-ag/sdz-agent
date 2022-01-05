import chalk from "chalk";
import fs from "fs";

import configJson from "../../config";
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
import { Config } from "sdz-agent-types";

const log = (msg: string) => console.log(chalk.green(msg));

!(async () => {
  try {
    await (async () => {
      const answers: any = {};
      const config = await (configJson) as Config;

      log("SEEDZ INTEGRATION AGENT");
      log("YOU WILL WALK THROUGH SOME CONFIGURATIONS STEPS");
      log("");

      answers.legacy = true; //await legacyMode(config?.legacy);

      answers.async = false; //await exportMode(config?.async);

      answers.ftp = await ftp(config?.ftp);

      if (answers.legacy) {
        answers.api = await api(config?.api);
      }

      const scopeAnswers = await scope(config?.scope);
      answers.scope = scopeAnswers.scope;

      const connectorType = await connector();
      let dtoType = "";

      answers.connector = connectorType;

      answers.erp = await erp(config.erp);

      switch (connectorType) {
        case "database": {
          answers.database = await database(config?.database, answers.erp);
          dtoType = answers.database.driver;
        }
      }

      answers.schedule = await schedule(config?.schedule);

      stubs(
        answers.erp,
        connectorType,
        dtoType,
        scopeAnswers.scope.map((item: any) => item.name)
      );

      const dir = process.env.CONFIGDIR || `${process.cwd()}/config`;

      fs.writeFileSync(
        `${dir}/config.json`,
        JSON.stringify(answers, null, "\t")
      );

      log("");
      log("CONGRATULATIONS, CONFIGURATION COMPLETED!");
    })();
  } catch {}
})();
