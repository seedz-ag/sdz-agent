import { Config } from "sdz-agent-types";
import { Logger, Validator } from "sdz-agent-common";
import ProcessScope from "./process-scope";
import ProcessScopeDatabase from "./process-scope-database";
import ProcessScopeFTP from "./process-scope-ftp";
import processScopeApi from "./process-scope-api";
import connector from "config/connector";

export default class Caller {
  private appd: any;
  private config: Config;
  private logger = Logger;
  private scope: ProcessScope;
  private transactions: any = {};

  constructor(config: Config, appd?: any) {
    this.config = config;
    this.appd = appd;
    process.env.DEBUG = config.debug ? "true" : undefined;
  }

  // FUNCTIONS
  async apm(transaction: string): Promise<void> {
    if (!this.appd) {
      return;
    }

    if (this.transactions[transaction]) {
      this.transactions[transaction].end();
      return;
    }

    this.transactions[transaction] = this.appd.startTransaction(`[CALLER > ${transaction}]`);
    this.logger.info(transaction);
  }

  async init(): Promise<void> {
    this.apm('DETECTING SCOPE');
    this.scope = new ProcessScope(
      this.config.scope,
      this.getConnector(),
      await this.getTransport()
    );
    this.apm('DETECTING SCOPE');
  }

  async run(): Promise<void> {
    this.logger.info("STARTING INTEGRATION CLIENT SEEDZ.");
    //     this.validate();
    await this.scope.process();
    this.logger.info("ENDING PROCESS");
    process.exit(1);
  }

  validate(): void {
    this.logger.info("VALIDATING SETTINGS.");
    const validator = new Validator(this.config);
    validator.auth();
    validator.database();
  }

  // GETTERS AND SETTERS
  getConnector() {
    this.apm("GETTING CONNECTOR")
    let connector;
    switch (this.config.connector) {
      case "database":
        connector = new ProcessScopeDatabase(this.config.database);
        this.apm("GETTING CONNECTOR")
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
    try {
      this.apm("GETTING TRANSPORT");
      transport = new processScopeApi(
        this.config.api,
        this.config.legacy
      );
      await transport.authenticate();
      this.logger.info("USING API TRANSPORT");
      return transport;
    } catch (e) {
      this.logger.info("USING FTP TRANSPORT");
      transport = new ProcessScopeFTP(this.config.ftp, this.config.legacy);
    }
    this.apm("GETTING TRANSPORT");
    return transport;
  }
}
