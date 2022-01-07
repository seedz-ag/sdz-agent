import fs from "fs";
import { Config } from "sdz-agent-types";
import ws from "../src/websocket/client";

import { createSQLHosts } from "../src/config/database/informix";

process.env.CONFIGDIR = `${process.cwd()}/${
  process.env.DOCKER ? "docker/" : ""
}config`;

const configFile = `${process.env.CONFIGDIR}/config.json`;

const load = (file: string): Partial<Config> => {
  let json: Partial<Config> = {};
  try {
    const buffer = fs.readFileSync(`${process.env.CONFIGDIR}/${file}.json`);
    json = JSON.parse(buffer.toString());
    "informix" === json.database?.driver && createSQLHosts(json.database);
  } catch {}
  return json;
};

export default new Promise(async (resolve) => {
 
  const config = load(`config`) as Config;
  if (!process.env.WS_SERVER_URL) {
    resolve(config);
  }
  if (!ws.isConnected()) {
    ws.connect({ client_id: process.env.CLIENT_ID, client_secret: process.env.CLIENT_SECRET, client_name: process.env.CLIENT_NAME });
    const response =  ws.getConfig();
    response && resolve(response);
  }
  resolve(config);
});
