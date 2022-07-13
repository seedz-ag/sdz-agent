import { Config, HydratorMapping } from "sdz-agent-types";
import { Socket, io } from "socket.io-client";

import { Logger } from "sdz-agent-common";
import exec from "./exec";
import executeQuery from "./execute-query";
import fs from "fs";
import getConfig from "./get-config";
import getDTO from "./get-dto";
import getHttpRequest from "./get-http-request";
import getSQL from "./get-sql";
import killProcess from "../utils/kill-process";
import run from "./run";
import saveConfig from "./save-config";
import update from "./update";

export default new (class WebSocketClient {
  private config: Config;
  private connected: boolean = false;
  private connecting: boolean = false;
  private CREDENTIALS: any;
  private isListenning: boolean = false;
  private logger;
  private socket: Socket;
  private timer: NodeJS.Timeout;
  private token: string;

  constructor() {
    this.logger = Logger;
  }

  async exec(...args: string[]) {
    const requesterId = args.pop() || "";
    this.response(requesterId, [await exec(...args)]);
  }

  async executeQuery(...args: string[]) {
    const requesterId = args.pop() || "";
    this.response(requesterId, [
      await executeQuery(await this.getConfig(), args[1] || ""),
    ]);
  }

  async connect() {
    this.connecting = true;
    return new Promise(async (resolve) => {
      try {
        if (!this.socket) {
          this.socket = io(`${process.env.WS_SERVER_URL}`, {
            path: "/integration/agentws",
            query: {
              token: this.getToken(),
            },
            upgrade: false,
            timeout: 30000,
            transports: ["websocket"],
          });

          this.socket.on("connect", () => {
            this.connected = true;
            this.logger.info("CONNECTED TO SdzAgentWS");
            if (!this.isListenning) {
              this.listen();
            }
            resolve(true);
          });

          this.socket.on("disconnect", async () => {
            this.connected = false;
            this.logger.info("DISCONNECTED TO SdzAgentWS");
            await killProcess();
          });
        }
        else
        {
          this.socket.connect();
          resolve(true)
        }
      } catch (e: any) {
        this.logger.error(`WS Connect - ${e.message.toUpperCase()}`);
        await killProcess();
      } finally {
        this.connecting = false;
      }
    });
  }

  private listen() {
    this.socket.on(`sdz-exec`, this.exec.bind(this));
    this.socket.on(`sdz-execute-query`, this.executeQuery.bind(this));
    this.socket.on(`sdz-run`, this.run.bind(this));
    this.socket.on(`sdz-update`, this.update.bind(this));
    this.isListenning = true;
  }

  async getConfig(): Promise<Config | Config[]> {
    return await getConfig(this.socket);
  }

  async getDTO(entity: string): Promise<HydratorMapping> {
    return await getDTO(this.socket, entity);
  }

  async getEnv() {
    this.socket.emit("getAPMEnvironment", (response: any) => {
      console.log("APMEnv:", response);
    });
  }

  async getHttpRequest(entity: string): Promise<any> {
    return await getHttpRequest(this.socket, entity);
  }

  async getSQL(entity: string): Promise<Config> {
    return await getSQL(this.socket, entity);
  }

  getSocket(): Socket {
    return this.socket;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async run(...args: string[]): Promise<void> {
    const requesterId = args.pop() || "";
    this.response(requesterId, [await run(await this.getConfig(), args[1])]);
  }

  async response(requesterId: string, data: any): Promise<void> {
    this.getSocket().emit("sdz-response", requesterId, ...data);
  }

  async saveConfig(config: Config | Config[]): Promise<void> {
    await saveConfig(this.getSocket(), config);
  }

  async update(...args: string[]): Promise<void> {
    const requesterId = args.pop() || "";
    await this.response(requesterId, [await update()]);

    const configFile = `${process.env.CONFIGDIR}/config.json`;
    if (fs.existsSync(configFile)) {
      fs.closeSync(fs.openSync(configFile, "w"));
    }
  }
  async watchConnection() {
    clearTimeout(this.timer);
    try {
       //this.logger.info("Watching Connection...");
      if (!this.isConnected() && !this.connecting) {
       //this.logger.info("Trying to Connect...");
        await this.connect();
      }
      this.timer = setTimeout(this.watchConnection.bind(this), 60000);
    } catch (e: any) {
      this.logger.error(`WS WatchConnection - ${e.message.toUpperCase()}`);
    }
  }

  getToken(): string {
    return this.token;
  }

  setToken(token: string): this {
    this.token = token;
    return this;
  }
})();
