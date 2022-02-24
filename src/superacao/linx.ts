import { readFileSync, unlinkSync, writeFileSync } from "fs";
import Base from "./base";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { Hydrator } from "sdz-agent-common";
import { TransportSeedz } from "sdz-agent-transport";
import { Logger } from "sdz-agent-common";

class Linx extends Base {
  private csv: CSV;
  private ftp: FTP;

  constructor(
    database: Database,
    csv: CSV,
    ftp: FTP,
    transport: TransportSeedz,
    credentials: any[]
  ) {
    super(database, transport, credentials);
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
        Logger.info(`Buscando: `, integration);
        const fileName = `${integration["filial"]}.csv`;
        if (
          await this.getFTP().getFile(
            `${integration["grupo"]}/${fileName}`,
            fileName
          )
        ) {
          let page = 0;
          while (true) {
            try {
              const file = readFileSync(fileName).toString().split("\n");
              const size = 10000;
              const csv = (await this.getCSV().read(fileName, {
                quote: "``",
                delimiter: ";",
                headers: false,
                skipRows: 0,
                maxRows: size,
              } as any)) as any[];
              if (!csv.length) {
                break;
              }
              const data = this.groupBy(
                csv.map((row) => {
                  const dto: any = Hydrator(this.getDTO(), row);
                  return {
                    ...dto,
                    cnpjOrigemDados: `${dto.cnpjOrigemDados}`.split(',').shift(),
                  }
                }),
                "cnpjOrigemDados"
              );
              for (const key of Object.keys(data)) {
                if (await this.changeCredentials(key)) {
                  Logger.info(`Enviando de ${key}: `, data[key].length);
                  await this.getTransport().send("notaFiscal", data[key]);
                } else {
                  Logger.error(`Credencial não encontrada para: `, key);
                }
              }
              writeFileSync(fileName, file.slice(size - 1).join("\n"));
              await new Promise((resolve) => setTimeout(resolve, 100));
            } catch (e) {
              console.log(e);
            }
          }
          unlinkSync(fileName);
        }
      }
    } catch (e: any) {
      console.log(e.response);
    }
  }
}

export default Linx;
