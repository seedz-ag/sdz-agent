import { Hydrator } from "sdz-agent-common";
import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { TransportSeedz } from "sdz-agent-transport";
import { HydratorMapping } from "sdz-agent-types";
import ReadFile from "sdz-agent-types/decorators/read-file";
import Database from "./database";

class Linx {

	private connection: Database;
  private csv: CSV;
  private dto: any;
	private ftp: FTP;
  private transport: TransportSeedz;

	constructor(connection: Database, csv: CSV, ftp: FTP, transport: TransportSeedz) {
    this.setConnection(connection);
    this.setCSV(csv);
    this.setDTO('dto-linx.json');
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
        const csv = await this.getCSV().read(fileName, { delimiter: ";" }) as any[];
        for (const row of csv) {
          this.getTransport().process(Hydrator(this.getDTO(), row));
        }
      }
      this.getTransport().send();
    } catch {}
  }

}

export default Linx;