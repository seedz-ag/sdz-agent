import { DatabaseRow } from "../interfaces/database-row.interface";
import { Client } from "pg";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

export class PostgresAdapter implements IDatabaseAdapter {
  private connection: Client;
  constructor(private readonly config: ConfigDatabaseInterface) { 
    this.validateConfig();
  }

  private validateConfig(): void {
    const requiredFields = ["host", "port", "schema", "username", "password"];
    const missing = requiredFields.filter(field => 
      !this.config[field as keyof ConfigDatabaseInterface] || 
      String(this.config[field as keyof ConfigDatabaseInterface]).length === 0
    );

    if (missing.length) {
      const message = `Missing required database config for POSTGRES: ${missing.join(", ")}`;
      throw new Error(message);
    }
  }


  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
      } catch (e) {
        console.log(e);
      }
    }
  }

  async connect(): Promise<void> {
    if (!this.connection) {
      try {
        this.connection = new Client({
          user: this.config.username,
          password: this.config.password,
          host: this.config.host,
          database: this.config.schema,
          port: this.config.port,
        });
        await this.connection.connect();
      } catch (e) {
        console.log(e);
      }
    }
  }

  async count(): Promise<number> {
    return 1;
  }

  disconnect(): Promise<void> {
    return this.connection.end();
  }

  async checkConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.connect();
      }
      const response: any = await this.connection.query<any[]>("SELECT 1 as ok");
      return !!response;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  async execute(query: string): Promise<DatabaseRow[]> {
    let resultSet: DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response: any = await this.connection.query<any[]>(query);
      if (response) {
        resultSet = response["rows"];
      }
    } catch (e) {
      console.log(e);
    }
    return resultSet;
  }

  async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
    let resultSet: DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response: any = await this.connection.query<any[]>(query);
      if (response) {
        resultSet = response["rows"];
      }
    } catch (e) {
      console.log(e);
      return e
    }
    return resultSet;
  }

  async getVersion() {
    //TODO: Implement
    return "n/a";
  }

  async query(query: string, page?: number, limit?: number): Promise<any> {
    const statement = [
      query,
      limit ? `LIMIT ${limit}` : null,
      page && limit ? `OFFSET ${page * limit}` : null,
    ]
      .filter((item) => !!item)
      .join(" ");
    return this.execute(statement);
  }
}
