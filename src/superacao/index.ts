import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import Linx from "./linx";
    
require("dotenv").config();

class Superacao {
  private connection: Database;
  private csv: CSV;
  private ftp: FTP;
  private transport: TransportSeedz;

  constructor() {
    this.csv = new CSV();
    this.ftp = new FTP();
    this.transport = new TransportSeedz();
  }

  async process() {
    const linx = new Linx(this.connection, this.csv, this.ftp, this.transport);
    await linx.process();
  }

}
