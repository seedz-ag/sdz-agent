import chalk from "chalk";
import { Logger } from "sdz-agent-common";
import dotenv from "dotenv";
import {
  Config,
  ConfigAuthFTP,
  ERPs,
  ConfigDatabaseInterface,
} from "sdz-agent-types";

import connector from "./connector";
import database from "./database";
import erp from "./erp";
import ftp from "./ftp";
import legacy from "./legacy";
import schedule from "./schedule";
import scope from "./scope";
import ws from "../websocket/client";
import configSelector from "./config-selector";
import configName from "./config-name";
import OpenIdClient from "../open-id";

interface IAnswers {
  name: string;
  legacy: boolean;
  async: boolean;
  fileSize: number;
  pageSize: number;
  ftp: Partial<ConfigAuthFTP>;
  scope: Config["scope"];
  connector: any;
  erp: ERPs;
  database: { driver?: string };
  schedule: { [key: string]: string | number };
}

dotenv.config();

const log = (msg: string) => console.log(chalk.green(msg));

(async () => {
  try {
    await (async () => {
      log("SEEDZ INTEGRATION AGENT");
      log("YOU WILL WALK THROUGH SOME CONFIGURATIONS STEPS");
      log("");

      const answers: Partial<IAnswers> = {};

      OpenIdClient.addSubscriber(ws.setToken.bind(ws));
      await OpenIdClient.connect();
      await OpenIdClient.grant();

      if (!ws.isConnected()) {
        await ws.connect();
      }
      if (!ws.isConnected()) {
        Logger.error("SDZ-AGENT-WS DISCONNECTED, ABORTING.");
        return false;
      }

      const configWs: Config | Config[] | undefined = await ws.getConfig();
      let config: any = configWs;
      let name: string;

      if (Array.isArray(config)) {
        name = await configSelector(config);
        config = config.find((config: Config) => config.name === name);
        answers.name = await configName(config?.name);
      } else {
        answers.name = await configName(config?.name);
      }

      answers.legacy = await legacy(false);
      answers.async = false;
      answers.fileSize = 5;
      answers.pageSize = 1000;
      answers.ftp = await ftp(config?.ftp);

      const scopeAnswers = await scope(config?.scope);
      answers.scope = scopeAnswers.scope;

      const connectorType = await connector();
      let dtoType: string | undefined = "";

      answers.connector = connectorType;

      answers.erp = await erp(config?.erp);

      switch (connectorType) {
        case "database": {
          answers.database = await database(config?.database, answers.erp);
          if (answers.database?.driver) {
            dtoType = answers.database.driver;
          }
        }
      }

      answers.schedule = await schedule(config?.schedule);

      if (Array.isArray(configWs)) {
        ws.saveConfig(
          configWs.map(
            (config: any) => {
              if (config.name === name) {
                return {
                  ...config,
                  ...answers,
                };
              }
            }
          )
        );
      } else {
        config = {
          ...config,
          ...answers,
        };
        ws.saveConfig([config]);
      }
      log("");
      log("CONGRATULATIONS, CONFIGURATION COMPLETED!");
    })();
  } catch (e) {
    console.log(e);
  }
})();
