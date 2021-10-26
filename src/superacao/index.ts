import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import { HydratorMapping } from "sdz-agent-types";
import { ReadFile } from "sdz-agent-types/decorators";
    
require("dotenv").config();

class Superacao {
  private csv: CSV;
  private dto: any;
  private ftp: FTP;
  private transport: TransportSeedz;

  constructor() {
    this.csv = new CSV();
    this.dto = this.getDTO("./dto.json");
    this.ftp = new FTP();
    this.transport = new TransportSeedz();
  }

  @ReadFile
  getDTO(file: string): HydratorMapping {
    return JSON.parse(file);
  }

  async readCSV(group: string) {
    try {
      const file = await this.ftp.read(`/lynx/${group}`);
      const rows = this.csv.parse(file);
      for (const row of rows) {
        this.transport.process({ data: Hydrator(this.dto, row), meta: null });
      }
      await this.transport.send();
    } catch {}
  }

  async process() {
    for (const group of []) {
      await this.readCSV(group);
    }
  }

  async sendBatch(data: any) {
  }

}
