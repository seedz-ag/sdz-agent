import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import { Config, Connector, } from "sdz-agent-types";
import FTP from "sdz-agent-sftp";
import MySQL from "sdz-agent-database-mysql";
import { TransportSeedz } from "sdz-agent-transport";
import Linx from "./linx";

    
require("dotenv").config();

export default class Superacao {
  private connection: Connector;
  private csv: CSV;
  private ftp: FTP;
  private transport: TransportSeedz;

  constructor(config:Config) {
    this.csv = new CSV(config.legacy);
    this.ftp = new FTP(config.ftp);
    this.transport = new TransportSeedz(config.api);
    this.connection = new MySQL.Connector(config.database);
  }

  async process() {
    const linx = new Linx(this.connection, this.csv, this.ftp, this.transport);
    await linx.process();
  }

}
