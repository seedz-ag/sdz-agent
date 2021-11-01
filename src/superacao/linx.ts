import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import { Connector, HydratorMapping } from "sdz-agent-types";
import Database from "./database";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import { ReadFile } from "sdz-agent-types/decorators";

class Linx {

	private connection: Database;
  private csv: CSV;
  private dto: any;
	private ftp: FTP;
  private transport: TransportSeedz;

	constructor(connection: Connector, csv: CSV, ftp: FTP, transport: TransportSeedz) {
    this.setConnection(connection);
    this.setCSV(csv);
    this.setDTO(`${process.cwd()}/src/superacao/dto-linx.json`);
    this.setFTP(ftp);
    this.setTransport(transport);
  }

  /**
   * Getters
   */
  getConnection(): Database {
    return this.connection;
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

  setConnection(connection: any): this {
    this.connection = connection;
    return this;
  }

  setCSV(csv: CSV): this {
    this.csv = csv;
    return this;
  }

  @ReadFile
  setDTO(file: string): this {
    this.dto = JSON.parse(file);
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
    return this.getConnection().getRepository().getIntegrations();
  }

  async process() {
    try {
      const integrations = await this.getList();
      for (const integration of integrations) {
        const fileName = `${integration['filial']}.csv`;
        await this.getFTP().getFile(`${integration['grupo']}/${fileName}`, fileName);
        const csv = await this.getCSV().read(fileName, { skipRows:0, maxRows: 100, delimiter: ";" }) as any[];
        for (const row of csv) {
          this.getTransport().send('superacao', Hydrator(this.getDTO(), row));
        }
      }
    } catch {}
  }

}

export default Linx;