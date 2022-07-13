import { Logger, Validator } from "sdz-agent-common";

import { Config } from "sdz-agent-types";
import ProcessScope from "./process-scope";
import ProcessScopeDatabase from "./process-scope-database";
import ProcessScopeFTP from "./process-scope-ftp";
import killProcess from "../utils/kill-process";
import processScopeApi from "./process-scope-api";

export default class Caller {
  private config: Config;
  private logger = Logger;
  private scope: ProcessScope;

  constructor(config: Config) {
    this.config = config;
    process.env.DEBUG = config.debug ? "true" : undefined;
  }
  async init() {
    this.scope = new ProcessScope(
      this.config.scope,
      this.getConnector(),
      await this.getTransport()
    );
  }
  getConnector() {
    switch (this.config.connector) {
      case "database":
        return new ProcessScopeDatabase(this.config.database);
      default:
        this.logger.error(
          `UNKNOW CONNECTOR SPECIFIED: ${this.config.connector}`
        );
        process.exit(0);
    }
  }

  async getTransport(): Promise<any> {
    try {
      const transport = new processScopeApi(
        this.config.api,
        this.config.legacy
      );
      await transport.authenticate();
      this.logger.info('USING API TRANSPORT')
      return transport;
    } catch (e) {
      this.logger.info('USING FTP TRANSPORT')
      return new ProcessScopeFTP(this.config.ftp, this.config.legacy);
    }
  }

  async run(): Promise<void> {
    this.logger.info("STARTING INTEGRATION CLIENT SEEDZ.");
    //     this.validate();
    await this.scope.process();
    this.logger.info("END PROCESS");
    await killProcess();
  }

  validate(): void {
    this.logger.info("VALIDATING SETTINGS.");
    const validator = new Validator(this.config);
    validator.auth();
    validator.database();
  }
}
