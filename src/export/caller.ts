import { Config } from "sdz-agent-types";
import { Logger, Validator } from "sdz-agent-common";
import ProcessScope from "./process-scope";
import ProcessScopeDatabase from "./process-scope-database";

export default class Caller {
  private config: Config;
  private logger = Logger;
  private scope: ProcessScope;

  constructor(config: Config) {
    this.config = config;
//     this.scope = new ProcessScope(this.config.scope, this.config.connector);
    process.env.DEBUG = config.debug ? "true" : undefined;
  }

  async run(): Promise<void> {
    this.logger.info("STARTING INTEGRATION CLIENT SEEDZ.");
//     this.validate();
    await this.scope.process();
  }

  validate(): void {
    this.logger.info("VALIDATING SETTINGS.");
    const validator = new Validator(this.config);
    validator.auth();
    validator.database();
  }
}
