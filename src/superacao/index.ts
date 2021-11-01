import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import { Config, Connector} from "sdz-agent-types";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import Linx from "./linx";
import Database from "sdz-agent-database";

    
require("dotenv").config();

export default class Superacao {
  private connection: Database;
  private csv: CSV;
  private ftp: FTP;
  private transport: TransportSeedz;

  constructor(config:Config) {
    this.csv = new CSV(config.legacy);
    this.ftp = new FTP(config.ftp);
    this.transport = new TransportSeedz(config.api);
    this.connection = new Database(config.database);
  }

  async process() {
    const linx = new Linx(this.connection, this.csv, this.ftp, this.transport);
    await linx.process();
  }

}
