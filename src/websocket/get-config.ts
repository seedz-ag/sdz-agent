import fs from "fs";
import { Config } from "sdz-agent-types";
import { Socket } from "socket.io-client";

export default async (socket: Socket): Promise<Config> => {
  return new Promise((resolve) => {
    socket.emit("get-config", (response: any) => {
      if(!Object.keys(response).length) {
        return resolve(response);
      }
      const file = `${process.cwd()}/${process.env.DOCKER ? "docker/" : "" }config/config.json`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      fs.writeFileSync(file, JSON.stringify(response, null, "\t"));
      resolve(response);
    });
  });
};
