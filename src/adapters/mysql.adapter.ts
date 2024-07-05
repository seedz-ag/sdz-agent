import { DatabaseRow } from "sdz-agent-types";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class MysqlAdapter implements IDatabaseAdapter {
  private connection: Connection;

  constructor(private readonly config: ConfigDatabaseInterface) { }

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
        this.connection = await mysql.createConnection({
          user: this.config.username,
          password: this.config.password,
          host: this.config.host,
          database: this.config.schema,
          port: this.config.port,
        });
      } catch (e) {
        console.log(e);
      }
    }
  }


  async disconnect(): Promise<void> {
    try {
      return await this.connection.end();
    } catch (exception) { }
  }

  async execute(query: string): Promise<DatabaseRow[]> {
    if (!this.connection) {
      await this.connect();
    }

    console.log(query)

    try {
      const [resultSet] = await this.connection.query<RowDataPacket[]>(query);
      return resultSet;
    } catch (exception) {
      // LOG QUERY EXCEPTION ERROR
      throw exception;
    }
  }

  async getVersion() {
    const [resultSet] = await this.execute("SELECT VERSION() as version");
    return resultSet.version;
  }

  query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]> {
    const statement = [
      query,
      limit ? `LIMIT ${limit}` : null,
      page && limit ? `OFFSET ${page * limit}` : null,
    ]
      .filter(Boolean)
      .join(" ");

    return this.execute(statement);
  }
}
