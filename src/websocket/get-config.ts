import { Config } from "sdz-agent-types";
import { Socket } from "socket.io-client";
import fs from "fs";

export default async (socket: Socket): Promise<Config | Config[]> => {
  return new Promise((resolve) => {
    socket.emit("get-config", (response: any) => {
      if(!Object.keys(response).length) {
        return resolve(response);
      }
      const file = `${process.cwd()}/${process.env.DOCKER ? "docker/" : "" }config/config.json`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      // fs.writeFileSync(file, JSON.stringify(response, null, "\t"));
      resolve(response);
    });
  });
};
