import { Config } from "sdz-agent-types";
import { Logger, Validator } from "sdz-agent-common";
import ProcessScope from "./process-scope";
import ProcessScopeDatabase from "./process-scope-database";
import ProcessScopeFTP from "./process-scope-ftp";
import processScopeApi from "./process-scope-api";

import { APM } from "sdz-agent-types/dist/decorators";

export default class Caller {
  private config: Config;
  private logger = Logger;
  private scope: ProcessScope;

  constructor(config: Config) {
    this.config = config;
    process.env.DEBUG = config.debug ? "true" : undefined;
  }

  // FUNCTIONS
  @APM((global as any).appd, "CALLER")
  apm(transaction: string): void {}

  async init(): Promise<void> {
    this.apm("DETECTING SCOPE");
    this.logger.info("DETECTING SCOPE");
    this.scope = new ProcessScope(
      this.config.scope,
      this.getConnector(),
      await this.getTransport()
    );
    this.apm("DETECTING SCOPE");
  }

  async runOnce(entity: string) {
    await this.scope.one(entity);
  }

  async run(): Promise<void> {
    this.apm("STARTING INTEGRATION CLIENT SEEDZ.");
    this.logger.info("STARTING INTEGRATION CLIENT SEEDZ.");
    //     this.validate();
    await this.scope.process();
    this.logger.info("ENDING PROCESS");
    this.apm("STARTING INTEGRATION CLIENT SEEDZ.");
    process.exit(1);
  }

  validate(): void {
    this.apm("VALIDATING SETTINGS");
    this.logger.info("VALIDATING SETTINGS.");
    const validator = new Validator(this.config);
    validator.auth();
    validator.database();
    this.apm("VALIDATING SETTINGS");
  }

  // GETTERS AND SETTERS
  getConnector() {
    this.apm("GETTING CONNECTOR");
    this.logger.info("GETTING CONNECTOR");
    let connector;
    switch (this.config.connector) {
      case "database":
        connector = new ProcessScopeDatabase(this.config.database);
        this.apm("GETTING CONNECTOR");
        return connector;
      default:
        this.logger.error(
          `UNKNOW CONNECTOR SPECIFIED: ${this.config.connector}`
        );
        process.exit(0);
    }
  }

  async getTransport(): Promise<any> {
    let transport;
    this.apm("GETTING TRANSPORT");
    this.logger.info("GETTING TRANSPORT");
    try {
      transport = new processScopeApi(this.config.api, this.config.legacy);
      await transport.authenticate();
      this.logger.info("USING API TRANSPORT");
    } catch (e) {
      this.logger.info("USING FTP TRANSPORT");
      transport = new ProcessScopeFTP(this.config.ftp, this.config.legacy);
    }
    this.apm("GETTING TRANSPORT");
    return transport;
  }
}
