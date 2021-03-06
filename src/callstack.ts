import { Config } from "sdz-agent-types";
import { Logger } from "sdz-agent-common";
import OpenIdClient from "./open-id";
import argv from "./args";
import csv from "./utils/csv";
import databaseConsumer from "./utils/consumers/database";
import dotenv from "dotenv";
import fs from "fs";
import ftpTransport from "./utils/transports/ftp";
import glob from "fast-glob";
import httpConsumer from "./utils/consumers/http";
import httpTransport from "./utils/transports/http";
import killProcess from "./utils/kill-process";
import moment from "moment";
import ws from "./websocket/client";

const callstack = async (configName = "default") => {
  try {
    dotenv.config();

    //CLEAR OLD FILES
    await glob("./output/*.csv").then((paths: string[]) =>
      paths.forEach(fs.unlinkSync)
    );
    await glob("./output/*.json").then((paths: string[]) =>
      paths.forEach(fs.unlinkSync)
    );
    await glob("./output/*.sql").then((paths: string[]) =>
      paths.forEach(fs.unlinkSync)
    );

    OpenIdClient.addSubscriber(
      httpTransport.getInstance().setToken.bind(httpTransport.getInstance())
    );
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
    let config: Config | Config[] | undefined = configWs;
    if (Array.isArray(config)) {
      config = config.find((config: Config) => config.name === configName);
      if (!config) {
        Logger.error(`Config ${configName} not found.`);
        throw new Error(`Config ${configName} not found.`);
      }
    }
    csv.setConfig(config);
    ftpTransport.setConfig(config);

    let consumer;

    switch (config.connector) {
      case "database":
        consumer = databaseConsumer;
        break;
      case "http":
        consumer = httpConsumer;
        break;
    }
    if (!consumer) {
      throw new Error("CONNECTOR NOT FOUND");
    }

    consumer.setConfig(config);

    Logger.info("STARTING INTEGRATION CLIENT SEEDZ.");

    consumer.setConfig(config);
    await consumer();

    if (!(argv as any).sqlDays) {
      config.lastExtraction = moment().format("YYYY-MM-DD");
      if (Array.isArray(configWs)) {
        configWs.map((c: Config) => {
          if (c.name === configName) {
            return config;
          }
          return c;
        });
        ws.saveConfig(configWs);
      } else {
        ws.saveConfig(config);
      }
    }

    Logger.info("ENDING PROCESS");
    (!process.env.COMMAND_LINE || process.env.COMMAND_LINE === "false") &&
    killProcess(0);
  } catch (e: any) {
    Logger.error(e.message);
  }
  return true;
};

export default callstack;
