import chalk from "chalk";
import fs from "fs";

import connector from "./connector";
import database from "./database";
import api from "./api";
import erp from "./erp";
import ftp from "./ftp";
import legacy from "./legacy";
import schedule from "./schedule";
import scope from "./scope";
import stubs from "./stubs";
import { Config, ConfigAuthOpenId } from "sdz-agent-types";
import auth from "./auth";
import dotenv from "dotenv";

dotenv.config();

const log = (msg: string) => console.log(chalk.green(msg));

!(async () => {
  try {
    await (async () => {
      log("SEEDZ INTEGRATION AGENT");
      log("YOU WILL WALK THROUGH SOME CONFIGURATIONS STEPS");
      log("");

      const answers: any = {};
      // let OpenIdClient;
      // let WSClient;

      answers.legacy = await legacy(false);

      // if (!answers.legacy) {
      //   const env: Partial<ConfigAuthOpenId> = { ...(await auth()) };
      //   const envKeys = Object.keys(env);
      //   if (envKeys.length) {
      //     let newENV = fs.readFileSync(`${process.cwd()}/.env`).toString();
      //     for (const key of envKeys) {
      //       process.env[key] = env[key as keyof ConfigAuthOpenId];
      //       console.log(process.env[key]);
      //       newENV = newENV.replace(
      //         new RegExp(`${key}.*`, "gi"),
      //         `${key}=${env[key as keyof ConfigAuthOpenId]}`
      //       );
      //     }
      //     fs.writeFileSync(`${process.cwd()}/.env`, newENV);

      //     console.log(env);
      //   }

      //   OpenIdClient = require("../open-id").default;
      //   WSClient = require("../websocket/client").default;
      //   await OpenIdClient.connect();
      //   OpenIdClient.addSubscriber(WSClient.setToken.bind(WSClient));
      //   await OpenIdClient.grant();
      //   await WSClient.connect();
      // }

      // const config = await (answers.legacy
      //   ? require("../../config").default
      //   : WSClient.getConfig());

      const config = await require("../../config").default;

      answers.async = false; //await exportMode(config?.async);

      answers.fileSize = 5;

      answers.pageSize = 1000;

      answers.ftp = await ftp(config?.ftp);

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

     // if (answers.legacy) {
        const dir = process.env.CONFIGDIR || `${process.cwd()}/config`;
        fs.writeFileSync(
          `${dir}/config.json`,
          JSON.stringify(answers, null, "\t")
        );
      // } else {
      //   WSClient.saveConfig(answers);
      // }

      log("");
      log("CONGRATULATIONS, CONFIGURATION COMPLETED!");
    })();
  } catch(e) {
    console.log(e)
  }
})();
