import fs from "fs";
import { Config } from "sdz-agent-types";
import { io } from "socket.io-client";

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

export default new Promise((resolve, reject) => {
  const config = load(`config`) as Config;
  if (!process.env.WS_SERVER_URL) {
    
  }
  resolve(config);
  const socket = io(`${process.env.WS_SERVER_URL}`);
  const credentials = {
    client_id: '',
    client_secret: '',
  };
  socket.on('connect', function () {
    console.log('Connected to Seedz-Agent-WS');
    socket.emit('getConfig', { credentials }, (response:any) => {
      if (fs.existsSync(configFile)) {
        fs.unlinkSync(configFile);
      }
fs.writeFileSync(configFile, JSON.stringify(response, null, "\t"));
      resolve(response); 
    });
    socket.emit('getAPMEnvironment', { credentials }, (response:any) => {
      console.log('APMEnv:', response);
    });
  });
});
