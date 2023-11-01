import { singleton } from "tsyringe";

import { LoggerAdapter } from "../adapters/logger.adapter";
import { DatabaseConsumer } from "../consumers/database.consumer";
import { FTPConsumer } from "../consumers/ftp.consumer";
import { HttpConsumer } from "../consumers/http.consumer";
import { IConsumer } from "../interfaces/consumer.interface";

@singleton()
export class ConsumerResolverService {
  constructor(
    private readonly databaseConsumer: DatabaseConsumer,
    private readonly ftpConsumer: FTPConsumer,
    private readonly httpConsumer: HttpConsumer,
    private readonly loggerAdapter: LoggerAdapter
  ) {}

  public resolve(dataSource: string): IConsumer {
    this.loggerAdapter.log(
      "info",
      `RESOLVING CONSUMER: ${dataSource.toUpperCase()}`
    );

    const consumers: Record<string, IConsumer> = {
      DATABASE: this.databaseConsumer,
      DB: this.databaseConsumer,
      FTP: this.ftpConsumer,
      HTTP: this.httpConsumer,
      WS: this.httpConsumer,
    };

    const consumer = consumers[dataSource.toUpperCase()];

    if (!consumer) {
      this.loggerAdapter.log("error", "DATASOURCE CONSUMER NOT FOUND");
      throw new Error();
    }
    this.loggerAdapter.log("info", "CONSUMER RESOLVED");

    return consumer;
  }
}
