import { Config } from "sdz-agent-types";
import { io, Socket } from "socket.io-client";

import executeQuery from "./execute-query";
import getConfig from "./get-config";
import run from "./run";
import update from "./update";

const client = (config: Config) => {
  const socket = io(`${process.env.WS_SERVER_URL}`);
  const credentials = {
    client_id: "",
    client_secret: "",
  };
};

export default class WebSocketClient {
  private socket: Socket;
  constructor(
    private readonly CREDENTIALS: any,
    private readonly config: Config
  ) {
    this.socket = io(`${process.env.WS_SERVER_URL}`);
  }

  async executeQuery(query: string, cb: any) {
    return await executeQuery(query, cb);
  }

  connect() {
    return new Promise((resolve) => {
      this.socket.on("connect", () => {
        const id = {
          client_id: this.CREDENTIALS.client_id,
          name: (this.config as any).name,
        };
        this.socket.emit("client-connect", id);
        this.listen();
        resolve(true);
      });
    });
  }

  private listen() {
    this.socket.on(`execute-query`, this.executeQuery);
    this.socket.on(`run`, this.run);
  }

  async getConfig() {
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

  async run(): Promise<void> {
    await run(this.socket, this.CREDENTIALS);
  }

  async update(cb: any): Promise<void> {
    await update(cb);
  }
}
