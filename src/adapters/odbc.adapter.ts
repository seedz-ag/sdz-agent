import { DatabaseRow } from "../interfaces/database-row.interface";
import odbc, { Connection } from "odbc";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

export class OdbcAdapter implements IDatabaseAdapter {
  private connection: Connection;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { }

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
            connectionString: this.config.host || '',
            loginTimeout: 999,
            connectionTimeout: 999,
          }

        );
      } catch (e) {
        console.log(e);
      }
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
      const response = await this.connection.query(query);
      if (response.length) {
        resultSet = response.map(rows => rows);
      }
    }
    catch (e) {
      console.log(e);
    }
    return resultSet;
  }

  async getVersion() {
    return ''
  }

  query(query: string, page?: number, limit?: number): Promise<any> {
    const statement = [
      query,
      "undefined" !== typeof page && limit ? `ORDER BY TIPOQUERY ASC, R_E_C_N_O_ ASC OFFSET ${page * limit} ROWS FETCH NEXT ${limit} ROWS ONLY` : null,
    ]
      .filter((item) => !!item)
      .join(" ");
    return this.execute(statement);
  }
}