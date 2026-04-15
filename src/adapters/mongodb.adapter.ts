import { DatabaseRow } from "../interfaces/database-row.interface";
import { MongoClient } from "mongodb";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { LoggerAdapter } from "./logger.adapter";

export class MongodbAdapter implements IDatabaseAdapter {
  private connection: MongoClient;
  private version: any;

  constructor(
    private readonly config: ConfigDatabaseInterface,
    private readonly loggerAdapter?: LoggerAdapter
  ) { }
  async close(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.close();
      } catch (e) {
        this.loggerAdapter?.log("error", "MONGODB CLOSE ERROR", e);
      }
    }
  }

  async connect(): Promise<void> {
    if (!this.connection) {
      try {
        const uri = this.config.port
          ? `mongodb://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/?maxPoolSize=1&w=majority`
          : `mongodb+srv://${this.config.username}:${this.config.password}@${this.config.host}/?maxPoolSize=1&w=majority`;
        const client = new MongoClient(uri);
        await client.connect();
        this.connection = client;
      } catch (e) {
        this.loggerAdapter?.log("error", "MONGODB CONNECT ERROR", e);
      }
    }
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }

  async execute(query: string): Promise<DatabaseRow[]> {
    let resultSet: DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const input = JSON.parse(query);
      const database = this.connection.db(this.config.schema);
      const collection: any = database.collection(input["collection"]);
      const command: any = collection[input["command"]].bind(collection);
      resultSet = await (command)(input[input["command"]]).toArray();
      return resultSet;
    } catch (e) {
      this.loggerAdapter?.log("error", "MONGODB EXECUTE ERROR", query, e);
    }
    return resultSet;
  }

  async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
    let resultSet: DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const input = JSON.parse(query);
      const database = this.connection.db(this.config.schema);
      const collection: any = database.collection(input["collection"]);
      const command: any = collection[input["command"]].bind(collection);
      resultSet = await (command)(input[input["command"]]).toArray();
      return resultSet;
    } catch (e) {
      this.loggerAdapter?.log("error", "MONGODB EXECUTE REMOTE ERROR", query, e);
      return e;
    }
  }

  async getVersion() {
    return ''
  }

  query(query: string, page?: number, limit?: number): Promise<any> {
    return this.execute(
      query
        .replace(/:skip/g, String((page || 0) * (limit || 1)))
        .replace(/:limit/g, String(limit || 1000)))
  }
}
