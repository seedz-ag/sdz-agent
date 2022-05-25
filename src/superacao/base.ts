import Database from "sdz-agent-database";
import { HydratorMapping } from "sdz-agent-types";
import { ReadFile } from "sdz-agent-types/dist/decorators";
import { TransportSeedz } from "sdz-agent-transport";

class Base {
  private credentials: any[];
  private currentCredential: any;
  private database: Database;
  private dto: HydratorMapping;
  private transport: TransportSeedz;

  constructor(
    database: Database,
    transport: TransportSeedz,
    credentials: any[]
  ) {
    if (new.target === Base) {
      throw new TypeError("Cannot construct Abstract instances directly");
    }
    this.setCredentials(credentials);
    this.setDatabase(database);
    this.setTransport(transport);
  }

  /**
   * Getters
   */
  getCredentials(): any[] {
    return this.credentials;
  }

  getCurrentCredential(): any {
    return this.currentCredential;
  }

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
  setCredentials(value: any[]): this {
    this.credentials = value;
    return this;
  }

  setCurrentCredential(credential: any): this {
    this.currentCredential = credential;
    return this;
  }

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
  async changeCredentials(id: string): Promise<boolean> {
    const needle = `00000000000000${id.replace(/[^0-9]/g, "")}`.slice(-14);
    switch (true) {
      case this.getCurrentCredential() &&
        this.getCurrentCredential().members.includes(needle):
        return true;
      case !this.getCurrentCredential() ||
        (this.getCredentials() &&
          !this.getCurrentCredential().members.includes(needle)):
        const credential = this.credentials.find((credential) =>
          credential.members.includes(needle)
        );
        if (credential) {
          this.setCurrentCredential(credential);
          await this.getTransport()
            .setCredentials(credential.credential)
            .authenticate();
          return true;
        }
      default:
        return false;
    }
  }

  groupBy(data: any[], column: string): any {
    const tmp: any = {};
    for (const row of data) {
      if (!Array.isArray(tmp[row[column]])) {
        tmp[row[column]] = [];
      }
      tmp[row[column]].push(row);
    }
    return tmp;
  }

  @ReadFile
  readFile(json: string): HydratorMapping {
    return JSON.parse(json);
  }
}

export default Base;
