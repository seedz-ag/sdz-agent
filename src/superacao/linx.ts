import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";

import Base from "./base";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { Hydrator } from "sdz-agent-common";
import { Logger } from "sdz-agent-common";
import { TransportSeedz } from "sdz-agent-transport";
import argv from "../args";
import moment from "moment";

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
    const groupName: string | undefined = (argv as any).groupName;
    return await this.getDatabase()
      .getConnector()
      .execute(
        `
        SELECT
          i.grupo, i.id, d.filial
        FROM
          jd_setup_integration i
        JOIN
          jd_setup_integration_detail d ON d.jd_setup_integration = i.id
        WHERE
          i.tipo = 'lynx' ${groupName ? ` AND i.grupo = '${groupName}'` : ''}
        `
      );
  }

  async process() {
    try {
      const dateLimit = moment(
        (argv as any).dateLimit ||
          moment().subtract(1, "month").format("YYYY-MM-DD"),
        "YYYY-MM-DD"
      );
      Logger.info(`Data limite: `, dateLimit.format("YYYY-MM-DD"));
      const integrations = await this.getList();
      for (const integration of integrations) {
        Logger.info(`Buscando: `, integration);
        const fileName = `${integration["filial"]}.csv`;

        try {
          await this.getFTP().getFile(
            `${integration["grupo"]}/${fileName}`,
            fileName
          );
        } catch (err) {
          Logger.error('[FTP] Arquivo não encontrado: ', `${integration["grupo"]}/${fileName}`);
          continue;
        }

        if (existsSync(fileName)) {
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
                csv
                  .filter(
                    (row) =>
                      Number(moment(row[10] || '01/01/1900', "DD/MM/YYYY").format("X")) >= 
                      Number(dateLimit.format("X"))
                  )
                  .map((row) => {
                    const dto: any = Hydrator(this.getDTO(), row);
                    return {
                      ...dto,
                      cnpjOrigemDados: `${dto.cnpjOrigemDados}`
                        .split(/(,|\.)/g)
                        .shift(),
                      cpfVendedor: `${dto.cpfVendedor}`
                        .split(/(,|\.)/)
                        .shift(),
                    };
                  }),
                "cnpjOrigemDados"
              );
              for (const key of Object.keys(data)) {
                if (await this.changeCredentials(key)) {
                  Logger.info(`Enviando de ${key}: `, data[key].length);
                  await this.getTransport().send("notaFiscal", data[key]);
                } else {
                  Logger.warning(`Credencial não encontrada para: `, key);
                }
              }
              writeFileSync(fileName, file.slice(size - 1).join("\n"));
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (e: any) {
              this.handleError(e);
            }
          }
          unlinkSync(fileName);
        }
        await new Promise((resolve) => setTimeout(resolve, 120000));
      }
    } catch (e: any) {
      this.handleError(e);
    }
  }

  private handleError(e: any) {
    if (e.response) {
      Logger.error(e.response.data);
    } else if (e.request) {
      Logger.error(e.request);
    } else {
      Logger.error(e.message);
    }
  }
}

export default Linx;
