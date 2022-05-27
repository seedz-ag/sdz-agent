import fs from "fs";
import { Logger } from "sdz-agent-common";
import { Config } from "sdz-agent-types";
import { Socket } from "socket.io-client";

export default async (socket: Socket, config: Config | Config[]): Promise<void> => {
  return new Promise((resolve) => {
    socket.emit("save-config", config, (response: any) => {
      Logger.log("CONFIG STORED IN SDZ AGENT WS SERVER.");
    });
  });
};
