import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import { HydratorMapping } from "sdz-agent-types";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import { ReadFile } from "sdz-agent-types/decorators";
import Database from "sdz-agent-database";
import Base from "./base";

class Linx extends Base {

  private csv: CSV;
	private ftp: FTP;

	constructor(database: Database, csv: CSV, ftp: FTP, transport: TransportSeedz) {
    super(database, transport);
    this.setCSV(csv);
    this.setDTO(`${process.cwd()}/src/superacao/dto-linx.json`);
    this.setFTP(ftp);
  }

  /**
   * Getters
   */
  getCSV(): CSV {
    return this.csv;
  }

  getFTP(): FTP {
    return this.ftp;
  }

  /**
   * Setters
   */
  setCSV(csv: CSV): this {
    this.csv = csv;
    return this;
  }

  setFTP(ftp: FTP): this {
    this.ftp = ftp;
    return this;
  }

  /**
   * Functions 
   */

	async getList(): Promise<any[]> {
    return await this.getDatabase().getConnector().execute("SELECT i.grupo, i.id, d.filial FROM   jd_setup_integration i JOIN jd_setup_integration_detail d ON d.jd_setup_integration = i.id WHERE  i.tipo = 'lynx'");
  }

  async process() {
    try {
      const integrations = await this.getList();
      for (const integration of integrations) {
        const fileName = `${integration['filial']}.csv`;
        await this.getFTP().getFile(`${integration['grupo']}/${fileName}`, fileName);
        const csv = await this.getCSV().read(fileName, { skipRows:0, maxRows: 100, delimiter: ";" }) as any[];
        for (const row of csv) {
          const dto =  Hydrator(this.getDTO(), row);
          this.getTransport().send('superacao', Hydrator(this.getDTO(), row));
        }
      }
    } catch {}
  }

}

export default Linx;