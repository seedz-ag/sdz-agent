import { Logger } from "sdz-agent-common";
import OpenIdClient from "./open-id";
import databaseConsumer from "./utils/consumers/database";
import dotenv from "dotenv";
import fs from "fs";
import ftpTransport from "./utils/transports/ftp";
import glob from "fast-glob";
import httpTransport from "./utils/transports/http";
import ws from "./websocket/client";

const callstack = async () => {
  try {
    dotenv.config();

    //CLEAR OLD FILES
    await glob("./**/*.csv").then((paths) => paths.forEach(fs.unlinkSync));
    await glob("./config/dto/*.json").then((paths) =>
      paths.forEach(fs.unlinkSync)
    );
    await glob("./config/sql/*.sql").then((paths) =>
      paths.forEach(fs.unlinkSync)
    );

    OpenIdClient.addSubscriber(httpTransport.getInstance().setToken.bind(httpTransport));
    OpenIdClient.addSubscriber(ws.setToken.bind(ws));
    await OpenIdClient.connect();
    await OpenIdClient.grant();
    await ws.connect();
    if (!ws.isConnected()) {
      Logger.error("SDZ-AGENT-WS DISCONNECTED, ABORTING.");
      return false;
    }

    const config = await ws.getConfig();
    ftpTransport.setConfig(config)

    let consumer;

    switch (config.connector) {
      case 'database': consumer = databaseConsumer; break;
      // case 'http': consumer = ''; break;
    }
    if (!consumer) {
      throw new Error('CONNECTOR NOT FOUND');
    }

    consumer.setConfig(config);

    Logger.info("STARTING INTEGRATION CLIENT SEEDZ.");

    consumer.setConfig(config);
    await consumer();

    Logger.info("ENDING PROCESS");
    (!process.env.COMMAND_LINE || process.env.COMMAND_LINE === "false") &&
      process.exit(0);
  } catch (e: any) {
    Logger.error(e.message);
  }
  return true;
};

export default callstack;
