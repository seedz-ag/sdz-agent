import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import { HydratorMapping } from "sdz-agent-types";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import { ReadFile } from "sdz-agent-types/decorators";
import Database from "sdz-agent-database";

class Linx {

	private database: any;
  private csv: CSV;
  private dto: HydratorMapping;
	private ftp: FTP;
  private transport: TransportSeedz;

	constructor(database: Database, csv: CSV, ftp: FTP, transport: TransportSeedz) {
    this.setDatabase(database);
    this.setCSV(csv);
    this.setDTO(`${process.cwd()}/src/superacao/dto-linx.json`);
    this.setFTP(ftp);
    this.setTransport(transport);
  }

  /**
   * Getters
   */
   getDatabase(): Database {
    return this.database;
  }

  getCSV(): CSV {
    return this.csv;
  }

  getDTO(): HydratorMapping  {
    return this.dto;
  }

  getFTP(): FTP {
    return this.ftp;
  }

  getTransport(): TransportSeedz {
    return this.transport;
  }

  /**
   * Setters
   */
  @ReadFile
  readFile(json: string): HydratorMapping {
    return JSON.parse(json);
  }
  setDatabase(database: Database): this {
    this.database = database;
    return this;
  }

  setCSV(csv: CSV): this {
    this.csv = csv;
    return this;
  }

  setDTO(json: string): this {
    this.dto = this.readFile(json);
    return this;
  }


  setFTP(ftp: FTP): this {
    this.ftp = ftp;
    return this;
  }

  setTransport(transport: TransportSeedz): this {
    this.transport = transport;
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