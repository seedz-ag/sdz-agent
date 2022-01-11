import { Config } from "sdz-agent-types";
import { io, Socket } from "socket.io-client";

import exec from "./exec";
import executeQuery from "./execute-query";
import fs from "fs";
import getConfig from "./get-config";
import run from "./run";
import update from "./update";
import { Logger } from "sdz-agent-common";

export default new class WebSocketClient {
  private config: Config;
  private connected: boolean = false;
  private CREDENTIALS: any;
  private isListenning: boolean = false;
  private logger;
  private socket: Socket;
  constructor() {
    this.logger = Logger;
    this.socket = io(`${process.env.WS_SERVER_URL}`);
  }

  async exec(command: string, cb: any) {
    return await exec(command, cb);
  }

  async executeQuery(query: string, cb: any) {
    return await executeQuery(query, cb);
  }

  connect(credentials: any) {
    this.CREDENTIALS = credentials;
    return new Promise((resolve) => {
      this.socket.on("connect", () => {
        this.connected = true;
        this.logger.info('Connected to SdzAgentWS');
        this.socket.emit("client-connect", credentials);
        if (!this.isListenning) {
          this.listen();
        }
        resolve(true);
      });
      this.socket.on("disconnect", () => {
        this.connected = false;
        this.logger.info('Disconnected to SdzAgentWS');
      });
    });
  }

  private listen() {
    this.socket.on(`exec`, this.exec);
    this.socket.on(`execute-query`, this.executeQuery);
    this.socket.on(`run`, this.run);
    this.socket.on(`update`, this.update);
    this.isListenning = true;
  }

  async getConfig(): Promise<Config> {
    return await getConfig(this.socket, this.CREDENTIALS);
  }

  async getEnv() {
    this.socket.emit("getAPMEnvironment", this.CREDENTIALS, (response: any) => {
      console.log("APMEnv:", response);
    });
  }

  getSocket(): Socket {
    return this.socket;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async run(args: string, cb: any): Promise<void> {
    await run(args, cb);
  }

  async update(cb: any): Promise<void> {
    await update(cb);

    const configFile = `${process.env.CONFIGDIR}/config.json`;
    if (fs.existsSync(configFile)) {
      fs.closeSync(fs.openSync(configFile, "w"));
    }
  }
}
