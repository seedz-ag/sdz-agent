import { DatabaseRow } from "sdz-agent-types";
import mssql, { Connection, ConnectionPool } from "mssql";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class MssqlAdapter implements IDatabaseAdapter {
  private connection: ConnectionPool;

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

  async connect(): Promise<any> {
    if (!this.connection) {
      try {
        this.connection = await mssql.connect({
          user: this.config.username,
          password: this.config.password,
          server: this.config.host,
          database: this.config.schema,
          port: Number(this.config.port),
          requestTimeout: 999999,
          options: {
            trustServerCertificate: true,
            encrypt: false,
          },
        })
      } catch (e) {
        console.log(e);
      }
    }
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }


  async execute(query: string): Promise<DatabaseRow[]> {
    if (!this.connection) {
      await this.connect();
    }
    try {
      let resultSet: DatabaseRow[] = [];
      const response = await this.connection.query(query);
      if (response) {
        resultSet = response.recordset;
      }
      return resultSet;
    } catch (exception) {
      // LOG QUERY EXCEPTION ERROR
      throw exception;
    }
  }

  async getVersion(): Promise<string> {
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
