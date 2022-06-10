import chalk from "chalk";
import { Logger } from "sdz-agent-common";
import dotenv from "dotenv";
import { Config, ConfigAuthFTP, ERPs } from "sdz-agent-types";

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
import isNewConfig from "./is-new-config";

interface IAnswers {
  name: string;
  legacy: boolean;
  async: boolean;
  fileSize: number;
  pageSize: number;
  ftp: Partial<ConfigAuthFTP>;
  scope: Config["scope"];
  connector: string;
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

      let config: Config | undefined;
      let configsArray: Config[];
      let name: string;
      let newConfig: Config[];
      let addConfig: boolean = false;

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

      const configWs: Config | Config[] = await ws.getConfig();

      if (Array.isArray(configWs)) {
        configsArray = configWs;
      } else {
        configsArray = [configWs];
      }

      if (Object.values(configsArray[0]).length !== 0) {
        addConfig = await isNewConfig();
      }

      name = addConfig ? "default" : await configSelector(configWs);

      config = configsArray.find((config: Config) => config.name === name);
      const configNameList = configsArray.map((config: Config) => config.name);

      answers.name = await configName(config?.name, configNameList, addConfig);
      answers.async = false;
      answers.fileSize = 5;
      answers.pageSize = 1000;
      answers.legacy = await legacy(false);
      answers.ftp = await ftp(config?.ftp);
      answers.scope = (await scope(config?.scope)).scope;
      answers.connector = await connector();
      answers.erp = await erp(config?.erp);

      switch (answers.connector) {
        case "database": {
          answers.database = await database(config?.database, answers.erp);
        }
      }

      answers.schedule = await schedule(config?.schedule);

      if (addConfig) {
        newConfig = [...configsArray, { ...answers }] as Config[];
      } else {
        newConfig = configsArray.map(
          (config: Config | undefined, index: Number) => {
            if (
              config?.name === name ||
              Object.values(configsArray[0]).length === 0
            ) {
              return {
                ...config,
                ...answers,
              };
            }
            return config;
          }
        ) as Config[];
      }

      ws.saveConfig(newConfig);

      log("");
      log("CONGRATULATIONS, CONFIGURATION COMPLETED!");
    })();
  } catch (e) {
    console.log(e);
  }
})();
