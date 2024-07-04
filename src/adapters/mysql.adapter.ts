import { DatabaseRow } from "sdz-agent-types";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class MysqlAdapter implements IDatabaseAdapter {
  private connection: Connection;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { }

  buildQuery(query: string): string {
    return query;
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
        this.connection = await mysql.createConnection(
          {
            user: this.config.username,
            password: this.config.password,
            host: this.config.host,
            database: this.config.schema,
            port: this.config.port,
          }
        );
      } catch (e) {
        console.log(e);
      }
    }
  }

  async count(query: string): Promise<number> {
    const resultSet = await this.execute(`SELECT COUNT (*) AS total FROM (${this.buildQuery(query)}) as tab1`);
    const obj: any = {}
    Object.keys(resultSet).map((key: any) => obj[key.toLowerCase()] = resultSet[key])
    return obj[0].total;
  }

  disconnect(): Promise<void> {
    return this.connection.end();
  }

  async execute(query: string): Promise<DatabaseRow[]> {
    let resultSet: DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response = await this.connection.query<RowDataPacket[]>(query);
      if (response) {
        resultSet = response[0];
      }
    } catch (e) {
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
      limit ? `LIMIT ${limit}` : null,
      page && limit ? `OFFSET ${page * limit}` : null,
    ]
      .filter((item) => !!item)
      .join(" ");
    return this.query(statement);
  }
}
