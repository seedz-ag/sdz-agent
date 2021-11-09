import erp from "config/erp";
import fs from "fs";
import { Config } from "sdz-agent-types";
import { client as WebSocketClient } from "websocket";
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
    resolve(config);
  }
  const client = new WebSocketClient();
  client.on("connectFailed", function (error) {
    resolve(config);
  });
  client.on("connect", function (connection) {
    connection.on("message", (message): void => {
      if (message.type === "utf8" && message.utf8Data) {
        const json = JSON.parse(message.utf8Data);
        if (fs.existsSync(configFile)) {
          fs.unlinkSync(configFile);
        }
        fs.writeFileSync(configFile, message.utf8Data);
        resolve(json);
      }
      resolve(config);
    });
    connection.on("error", (error) => {
      resolve(config);
    });
    connection.sendUTF(JSON.stringify({ action: "get-config" }));
  });
  client.connect(process.env.WS_SERVER_URL as string, "echo-protocol");
});
