import fs from "fs";
import { Config } from "sdz-agent-types";
import { Socket } from "socket.io-client";

export default async (socket: Socket, entity: string): Promise<Config> => {
  return new Promise((resolve) => {
    socket.emit("get-query", entity, (response: any) => {
      if(!Object.keys(response).length) {
        return resolve(response);
      }
      
      resolve(response);
    });
  });
};
