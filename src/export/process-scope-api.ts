import TransportSeedz from "sdz-agent-transport";
import { ConfigAuthAPI } from "sdz-agent-types";
export default class {
  private config: ConfigAuthAPI;
  private legacy: boolean;
  private promises: Promise<boolean>[];
  private transport: any;
  constructor(config: ConfigAuthAPI, legacy: boolean) {
    this.config = config;
    this.legacy = legacy;
    this.promises = [];
  }

  async authenticate(): Promise<boolean> {
    return this.getTransport().authenticate();
  }

  getTransport() {
    if (!this.transport) {
      this.transport = new (this.legacy ? TransportSeedz : TransportSeedz)(
        this.config
      );
    }
    return this.transport;
  }

  async process(response: any) {
    this.promises.push(
      await this.getTransport().send("auth/login", response.data)
    );
  }

  async send() {
    await Promise.all(this.promises);
  }
}
