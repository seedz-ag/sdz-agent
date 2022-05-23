import fs from "fs";
import { Config, HydratorMapping } from "sdz-agent-types";
import { Socket } from "socket.io-client";

export default async (socket: Socket, entity: string): Promise<HydratorMapping> => {
  return new Promise((resolve) => {
    socket.emit("get-dto", entity, (response: any) => {
      if(!Object.keys(response).length) {
        return resolve(response);
      }
      resolve(response);
    });
  });
};
