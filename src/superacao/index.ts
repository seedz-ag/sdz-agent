import argv from "../args";
import CSV from "sdz-agent-data";
import { Config } from "sdz-agent-types";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import Linx from "./linx";
import { Logger } from "sdz-agent-common";
import Protheus from "./protheus";
import { TransportSeedz } from "sdz-agent-transport";
import { MongoClient } from "mongodb";

require("dotenv").config();

export default class Superacao {
  private connection: Database;
  private config: Partial<Config>;
  private csv: CSV;
  private credentials: any[];
  private ftp: FTP;
  private mongo: MongoClient;
  private transport: TransportSeedz;

  constructor(config: Partial<Config>) {
    this.configure(config);
  }

  configure(config: Partial<Config>): this {
    if (config.api && config.database && config.ftp) {
      this.config = config;
      this.csv = new CSV(config.legacy as boolean);
      this.ftp = new FTP(config.ftp);
      this.mongo = new MongoClient(`${this.config.mongoUrl}`);
      this.mongo.connect();
      this.transport = new TransportSeedz(
        `${config.issuerUrl}`,
        `${config.api.url}`,
        {
          client_id: config.api.username,
          client_secret: config.api.password,
        }
      );
      this.transport.setUriMap({
        notaFiscal: "invoice-items",
      });
      this.connection = new Database(config.database);
      return this;
    }
    throw new Error("Invalid Config");
  }

  private async getGroupsCredentials() {
    if (!this.credentials) {
      const groups = await this.mongo
        .db(process.env.SUPERACAO_MONGO_AGENT_DATABASE)
        .collection("groups")
        .find({})
        .project({ members: true, name: true, ref: true })
        .toArray();
      const credentials = await this.mongo
        .db(process.env.SUPERACAO_MONGO_IDENTITY_DATABASE)
        .collection("client")
        .find({ _id: { $in: groups.map(({ ref }: any) => ref) } })
        .project({ _id: true, client_id: true, client_secret: true })
        .toArray();
      this.credentials = groups.map((group) => {
        return {
          ...group,
          credential: credentials.find(
            (credential) => credential._id.toString() === group.ref.toString()
          ),
        };
      });
    }
    return this.credentials;
  }

  async process(): Promise<void> {
    Logger.info("STARTING PROCESS SEEDZ SUPERACAO");
    await this.getGroupsCredentials();
    if (["ALL", "LINX"].includes(`${(argv as any).types}`.toUpperCase())) {
      Logger.info("STARTING PROCESSING LINX");
      const linx = new Linx(
        this.connection,
        this.csv,
        this.ftp,
        this.transport,
        this.credentials
      );
      await linx.process();
      Logger.info("END PROCESS LINX");
    }
    if (["ALL", "PROTHEUS"].includes(`${(argv as any).types}`.toUpperCase())) {
      Logger.info("STARTING PROCESSING PROTHEUS");
      const protheus = new Protheus(this.connection, this.transport, this.credentials);
      await protheus.process();
      Logger.info("END PROCESS PROTHEUS");
    }
  }
}
