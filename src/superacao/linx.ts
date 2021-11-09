import Base from "./base";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { Hydrator } from "sdz-agent-common";
import { TransportSeedz } from "sdz-agent-transport";

class Linx extends Base {
  private csv: CSV;
  private ftp: FTP;

  constructor(
    database: Database,
    csv: CSV,
    ftp: FTP,
    transport: TransportSeedz
  ) {
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
    return await this.getDatabase()
      .getConnector()
      .execute(
        "SELECT i.grupo, i.id, d.filial FROM   jd_setup_integration i JOIN jd_setup_integration_detail d ON d.jd_setup_integration = i.id WHERE  i.tipo = 'lynx'"
      );
  }

  async process() {
    try {
      const integrations = await this.getList();
      for (const integration of integrations) {
        const fileName = `${integration["filial"]}.csv`;
        await this.getFTP().getFile(
          `${integration["grupo"]}/${fileName}`,
          fileName
        );
        let csv;
        let skipRows = 0;
        while (true) {
          csv = (await this.getCSV().read(fileName, {
            headers: false,
            skipRows,
            maxRows: 100,
            delimiter: ";",
          })) as any[];
          if (!csv.length) break;
          for (const row of csv) {
            const dto = Hydrator(this.getDTO(), row);
            this.getTransport().send("superacao", Hydrator(this.getDTO(), row));
          }
          skipRows += 100;
          // console.log(`${skipRows} rows processed`);
        }
      }
    } catch {}
  }
}

export default Linx;
