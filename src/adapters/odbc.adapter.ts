import { DatabaseRow } from "../interfaces/database-row.interface";
import odbc, { Connection } from "odbc";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

export class OdbcAdapter implements IDatabaseAdapter {
  private connection: Connection;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { 
    this.validateConfig();
  }

  private validateConfig(): void {
    const connectionString = this.config.connectionstring || this.config.connectionString;
    if (!connectionString || String(connectionString).length === 0) {
      const message = `Missing required database config for ODBC: connectionstring or connectionString`;
      throw new Error(message);
    }
  }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (e) {
        console.log(e);
      }
    }
  }

  async connect(): Promise<void> {
    if (!this.connection) {
      try {
        this.connection = await odbc.connect(
          {
            connectionString: this.config.connectionstring || this.config.connectionString || '',
            loginTimeout: 999,
            connectionTimeout: 999,
          }

        );
      } catch (e) {
        console.log(e);
      }
    }
  }

  async checkConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.connect();
      }
      const result = await this.connection.query<DatabaseRow>("SELECT 1 as ok");
      return Array.isArray(result);
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }

  async execute(query: string) {
    let resultSet: any = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response = await this.connection.query<DatabaseRow>(query);
      if (response.length) {
        resultSet = response.map(rows => rows);
      }
    }
    catch (e) {
      console.log(e);
    }
    return resultSet;
  }

  async executeQueryRemote(query: string) {
    let resultSet: any = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response = await this.connection.query<DatabaseRow>(query);
      if (response.length) {
        resultSet = response.map(rows => rows);
      }
    }
    catch (e) {
      console.log(e);
      return e
    }
    return resultSet;
  }

  async getVersion() {
    return ''
  }

  query(query: string, page?: number, limit?: number): Promise<any> {
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
