import Database from "sdz-agent-database";
import FTP from "sdz-agent-sftp";
import { HydratorMapping } from "sdz-agent-types";
import { ReadFile } from "sdz-agent-types/decorators";
import { TransportSeedz } from "sdz-agent-transport";

class Base {
  private database: Database;
  private dto: HydratorMapping;
  private transport: TransportSeedz;

  constructor(database: Database, transport: TransportSeedz) {
    if (new.target === Base) {
      throw new TypeError("Cannot construct Abstract instances directly");
    }
    this.setDatabase(database);
    this.setTransport(transport);
  }

  /**
   * Getters
   */
  getDatabase(): Database {
    return this.database;
  }

  getDTO(): HydratorMapping {
    return this.dto;
  }

  getTransport(): TransportSeedz {
    return this.transport;
  }

  /**
   * Setters
   */
  setDatabase(database: Database): this {
    this.database = database;
    return this;
  }

  setDTO(json: string): this {
    this.dto = this.readFile(json);
    return this;
  }

  setTransport(transport: TransportSeedz): this {
    this.transport = transport;
    return this;
  }

  /**
   * Functions
   */
  @ReadFile
  readFile(json: string): HydratorMapping {
    return JSON.parse(json);
  }
}

export default Base;
