import CSV from "sdz-agent-data";
import { Config } from "sdz-agent-types";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import Linx from "./linx";
import { Logger } from "sdz-agent-common";
import Protheus from "./protheus";
import { TransportSeedz } from "sdz-agent-transport";

require("dotenv").config();

export default class Superacao {
  private connection: Database;
  private csv: CSV;
  private ftp: FTP;
  private transport: TransportSeedz;

  constructor(config: Partial<Config>) {
    this.configure(config);
  }

  configure(config: Partial<Config>): this {
    if (config.api && config.database && config.ftp) {
      this.csv = new CSV(config.legacy as boolean);
      this.ftp = new FTP(config.ftp);
      this.transport = new TransportSeedz(`${config.api.url}`, {
        client_id: config.api.username,
        client_secret: config.api.password,
      });
      this.connection = new Database(config.database);
      return this;
    }
    throw new Error('Invalid Config');
  }

  async process(): Promise<void> {
    Logger.info("STARTING PROCESS SEEDZ SUPERACAO");
    Logger.info("STARTING PROCESSING LINX");
    const linx = new Linx(this.connection, this.csv, this.ftp, this.transport);
    await linx.process();
    Logger.info("END PROCESS LINX");
    Logger.info("STARTING PROCESSING PROTHEUS");
    const protheus = new Protheus(this.connection, this.transport);
    await protheus.process();
    Logger.info("END PROCESS PROTHEUS");
  }
}
