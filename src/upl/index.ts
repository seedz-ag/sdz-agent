import { Hydrator, Logger } from "sdz-agent-common";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";

import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { MongoClient } from "mongodb";
import { TransportSeedz } from "sdz-agent-transport";
import moment from "moment";

export default class Superacao {
  private config: any;
  private csv: CSV;
  private dto: { [key: string]: string };
  private ftp: FTP;
  private mongo: MongoClient;
  private transport: TransportSeedz;

  constructor(config: any) {
    this.config = config;
    this.configure(config);
  }

  configure(config: any): this {
    config = config || this.config;
    if (config) {
      this.csv = new CSV(true);
      this.dto = JSON.parse(readFileSync('./src/upl/dto.json').toString());
      this.ftp = new FTP(config.ftp);
      this.mongo = new MongoClient(`${config.mongo.url}`);
      this.mongo.connect();
      this.transport = new TransportSeedz(
        `${config.issuer.url}`,
        `${config.api.url}`
      );
      this.transport.setUriMap({
        notaFiscal: "invoice-items",
      });
      return this;
    }
    throw new Error("Invalid Config");
  }
  async changeCredentials(credential: any): Promise<void> {
    await this.transport.setCredentials(credential).authenticate();
  }

  async process(): Promise<void> {
    Logger.info("STARTING PROCESS UPL FTP");
    const credentials = await this.mongo
      .db(this.config.mongo.identityDatabase)
      .collection("client")
      .find({})
      .project({
        _id: true,
        client_id: true,
        client_secret: true,
        tenantId: true,
      })
      .toArray();

    for (const credential of credentials) {
      console.log(credential);
      const list = await this.ftp.list(credential.tenantId);
      const fileName = "process.csv";

      for (const file of list) {
        if (!file.endsWith(".csv")) continue;
        try {
          await this.ftp.getFile(file, fileName);
        } catch (err) {
          Logger.warning("[FTP] Arquivo não encontrado: ", file);
          continue;
        }
        const csv = (await this.csv.read(fileName, {
          quote: "``",
          delimiter: ";",
          headers: false,
          skipRows: 0,
          maxRows: 10000,
        } as any)) as string[];

        if (existsSync(fileName)) {
          let page = 0;
          while (true) {
            try {
              const file = readFileSync(fileName).toString().split("\n");
              const size = 10000;
              const csv = (await this.csv.read(fileName, {
                quote: "``",
                delimiter: ";",
                headers: false,
                skipRows: 0,
                maxRows: size,
              } as any)) as any[];
              if (!csv.length) {
                break;
              }
              const data = csv.map((row) => Hydrator(this.dto, row));
              await this.changeCredentials(credential);
              Logger.info(`Enviando: `, data.length);
              await this.transport.send("notaFiscal", data);
              writeFileSync(fileName, file.slice(size - 1).join("\n"));
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } catch (e: any) {
              this.handleError(e);
            }
          }
          this.ftp.renameFile(
            `${file}`,
            `${credential.tenantId}/processado/${moment().format(
              "YYYY-MM-DD"
            )}-${fileName}`
          );
          unlinkSync(fileName);
        }
      }
    }
    Logger.info("END PROCESS UPL FTP");
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
