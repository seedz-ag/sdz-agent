import { DatabaseRow } from "../interfaces/database-row.interface";
import mysql, { Connection, RowDataPacket } from "mysql2/promise";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { LoggerAdapter } from "./logger.adapter";
import { unknown } from "zod";

export class MysqlAdapter implements IDatabaseAdapter {
  private connection: Connection;

  constructor(
    private readonly config: ConfigDatabaseInterface,
    private readonly loggerAdapter?: LoggerAdapter
  ) { }

  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.end();
      } catch (e) {
        this.loggerAdapter?.log("error", "MYSQL CLOSE ERROR", e);
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
        this.loggerAdapter?.log("error", "MYSQL CONNECT ERROR", e);
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      return await this.connection.end();
    } catch (e) {
      this.loggerAdapter?.log("error", "MYSQL DISCONNECT ERROR", e);
    }
  }

  async execute(query: string): Promise<DatabaseRow[]> {
    if (!this.connection) {
      await this.connect();
    }
    try {
      const [resultSet] = await this.connection.query<RowDataPacket[]>(query);
      return resultSet;
    } catch (e) {
      this.loggerAdapter?.log("error", "MYSQL EXECUTE ERROR", query, e);
      return [];
    }
  }

  async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
    if (!this.connection) {
      await this.connect();
    }
    try {
      const [resultSet] = await this.connection.query<RowDataPacket[]>(query);
      return resultSet;
    } catch (exception) {
      this.loggerAdapter?.log("error", "MYSQL EXECUTE REMOTE ERROR", query, exception);
      return exception;
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
