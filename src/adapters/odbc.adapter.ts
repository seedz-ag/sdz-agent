import { DatabaseRow } from "sdz-agent-types";
import odbc, { Connection } from "odbc";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class OdbcAdapter implements IDatabaseAdapter {
  private connection: Connection;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { }

  buildQuery(query: string): string {
    return query;
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
        this.connection = await odbc.connect(this.config);
      } catch (e) {
        console.log(e);
      }
    }
  }

  async count(query: string): Promise<number> {
    const resultSet = await this.execute(`SELECT COUNT (*) AS total FROM (${this.buildQuery(query)}) as tab1`);
    const obj: any = {}
    Object.keys(resultSet).map((key) => obj[key.toLowerCase()] = resultSet[key])
    return obj[0].total;
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }

  execute(query: string, page?: number, limit?: number): Promise<any> {
    const statement = [
      this.buildQuery(query),
      "undefined" !== typeof page && limit ? `ORDER BY TIPOQUERY ASC, R_E_C_N_O_ ASC OFFSET ${page * limit} ROWS FETCH NEXT ${limit} ROWS ONLY` : null,
    ]

      .filter((item) => !!item)
      .join(" ");
    return this.connection.query(statement);
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
    return this.query(statement);
  }
}
