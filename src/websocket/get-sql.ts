import fs from "fs";
import { Config } from "sdz-agent-types";
import { Socket } from "socket.io-client";

export default async (socket: Socket, entity: string): Promise<Config> => {
  return new Promise((resolve) => {
    socket.emit("get-query", entity, (response: any) => {
      if(!Object.keys(response).length) {
        return resolve(response);
      }
      const file = `${process.cwd()}/${process.env.DOCKER ? "docker/" : "" }config/sql/${entity}.sql`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      fs.writeFileSync(file, response);
      resolve(response);
    });
  });
};
