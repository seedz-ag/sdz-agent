import fs from "fs";
import { Logger } from "sdz-agent-common";
import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { Config, Entity, HydratorMapping } from "sdz-agent-types";

export default class Process {
  private config: Config;
  private database: Database;
  private entities: Entity[];
  private ftp: FTP;

  constructor(config: Config) {
    this.setConfig(config);
    this.setDatabase(new Database(this.getConfig().database));
    this.setEntities(this.getConfig().scope);
    this.setFTP(new FTP(this.getConfig().ftp));
  }

  // FUNCS
  async dump(name: string) {
    const entity = this.getEntities().find(entity => name.toLocaleLowerCase() === entity.name.toLocaleLowerCase());

    if (!entity) {
      throw new Error('Entity not found in scope.');
    }

    console.log(entity);
  }

  async validateFTP() {
    Logger.info("VALIDATING CLIENT FTP");
    await this.ftp.connect();
  }

  async readDTO(file: string): Promise<HydratorMapping> {
    return JSON.parse(
      fs
        .readFileSync(
          `${process.env.CONFIGDIR}/dto/${file.toLocaleLowerCase()}.json`
        )
        .toString()
    ) as HydratorMapping;
  }

  // SETTERS AND GETTERS
  getConfig(): Config {
    return this.config;
  }

  setConfig(config: Config): this {
    this.config = config;
    return this;
  }

  getDatabase(): Database {
    return this.database;
  }

  setDatabase(database: Database): this {
    this.database = database;
    return this;
  }

  getEntities(): Entity[] {
    return this.entities;
  }

  setEntities(entities: Entity[]): this {
    this.entities = entities;
    return this;
  }

  getFTP(): FTP {
    return this.ftp;
  }

  setFTP(ftp: FTP): this {
    this.ftp = ftp;
    return this;
  }
}
