import { Config } from "sdz-agent-types";
import { Logger, Validator } from "sdz-agent-common";
import ProcessScope from "./process-scope";
import ProcessScopeDatabase from "./process-scope-database";
import ProcessScopeFTP from "./process-scope-ftp";
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
      console.log("api");
      return transport;
    } catch (e) {
      console.log("ftp");
      return new ProcessScopeFTP(this.config.ftp, this.config.legacy);
    }
  }

  async run(): Promise<void> {
    this.logger.info("STARTING INTEGRATION CLIENT SEEDZ.");
    //     this.validate();
    await this.scope.process();
    this.logger.info("END PROCESS");
    process.exit(1);
  }

  validate(): void {
    this.logger.info("VALIDATING SETTINGS.");
    const validator = new Validator(this.config);
    validator.auth();
    validator.database();
  }
}
