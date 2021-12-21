import fs from "fs";
import { Socket } from "socket.io-client";

export default async (socket: Socket, CREDENTIALS: any) => {
  return new Promise((resolve) => {
    socket.emit("get-config", CREDENTIALS, (response: any) => {
      const file = `${process.cwd()}/config/config.json`;
      if (fs.existsSync(file)) {
        fs.unlinkSync(file);
      }
      fs.writeFileSync(file, JSON.stringify(response, null, "\t"));
      resolve(response);
    });
  });
};
