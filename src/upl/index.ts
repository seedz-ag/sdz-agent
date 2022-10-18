import { Hydrator, Logger } from "sdz-agent-common";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";

import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { HydratorMapping } from "sdz-agent-types";
import { MongoClient } from "mongodb";
import { TransportSeedz } from "sdz-agent-transport";
import moment from "moment";

export default class UPL {
  private config: Record<string, any>;
  private csv: CSV;
  private dtos: Record<string, HydratorMapping>;
  private ftp: FTP;
  private mongo: MongoClient;
  private transport: TransportSeedz;

  constructor(config: Record<string, any>) {
    this.config = config;
    this.configure(config);
  }

  configure(config: any): this {
    config = config || this.config;
    if (config) {
      this.csv = new CSV(true);
      this.dtos = {
        inventories: JSON.parse(readFileSync('./src/upl/inventories.json').toString()),
        'invoice-items': JSON.parse(readFileSync('./src/upl/invoice-items.json').toString()),
        items: JSON.parse(readFileSync('./src/upl/items.json').toString()),
      };
      this.ftp = new FTP(config.ftp);
      this.mongo = new MongoClient(`${config.mongo.url}`);
      this.mongo.connect();
      this.transport = new TransportSeedz(
        `${config.issuer.url}`,
        `${config.api.url}`
      );
      this.transport.setUriMap({
        'inventories': "inventories",
        'invoice-items': "invoice-items",
        'items': "items",
      });
      return this;
    }
    throw new Error("Invalid Config");
  }
  async changeCredentials(credential: any): Promise<void> {
    await this.transport.setCredentials(credential).authenticate();
  }

  async process(): Promise<void> {
    Logger.info("[NODE] STARTING PROCESS UPL FTP");
    Logger.info("[MONGO] GETTING CLIENT IDENTITIES");
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
      if(credential?.tenantId) {
        Logger.info("[FTP] SEARCHING NEW FILES FROM " + credential.tenantId);
        const list = await this.ftp.list(credential.tenantId);

        for (const { name: fileName } of list) {
          if (!fileName.endsWith(".csv")) continue;
          const type = fileName.split(".").shift();
          if (!['inventories', 'invoice-items', 'items'].includes(type)) {
            Logger.error("[DTO] INVALID TYPE: " + type);
            continue;
          }
          try {
            Logger.info("[FTP] DOWNLOADING FILE " + fileName);
            await this.ftp.getFile(`${credential.tenantId}/${fileName}`, fileName);
          } catch (err) {
            Logger.warning("[FTP] FILE NOT FOUND: ", fileName);
            continue;
          }

          if (existsSync(fileName)) {
            let page = 0;
            while (true) {
              try {
                const size = 10000;
                Logger.info("[CSV] READING: ", fileName);
                const csv = (await this.csv.read(fileName, {
                  // quote: "``",
                  delimiter: ";",
                  headers: true,
                  skipRows: size * page,
                  maxRows: size,
                } as any)) as any[];
                if (!csv.length) {
                  break;
                }
                Logger.info("[DTO] HYDRATING: ", fileName);
                const data = csv.map((row) => Hydrator(this.dtos[type], row));
                await this.changeCredentials(credential);
                Logger.info("[TRANSPORT] SENDING: ", data.length);
                await this.transport.send(type, data);
                page++
              } catch (e: any) {
                this.handleError(e);
              }
            }
            Logger.info("[FTP] RENAMING FILE: ", fileName);
            this.ftp.renameFile(
              `${credential.tenantId}/${fileName}`,
              `${credential.tenantId}/processado/${moment().format(
                "YYYY-MM-DD"
              )}-${fileName}`
            );
            Logger.info("[FS] DELETING FILE: ", fileName);
            unlinkSync(fileName);
          }
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
