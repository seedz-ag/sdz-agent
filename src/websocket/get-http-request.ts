import { Config, HydratorMapping } from "sdz-agent-types";

import { Socket } from "socket.io-client";

export default async (socket: Socket, entity: string): Promise<any> => {
  return new Promise((resolve) => {
    socket.emit("get-http-request", entity, (response: any) => {
      resolve(response);
    });
  });
};
