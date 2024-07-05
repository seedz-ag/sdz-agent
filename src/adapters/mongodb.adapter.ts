import { DatabaseRow } from "sdz-agent-types";
import { MongoClient, Collection } from "mongodb";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class MongodbAdapter implements IDatabaseAdapter {
  private connection: MongoClient;
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
        const uri = this.config.port
          ? `mongodb://${this.config.username}:${this.config.password}@${this.config.host}:${this.config.port}/?maxPoolSize=1&w=majority`
          : `mongodb+srv://${this.config.username}:${this.config.password}@${this.config.host}/?maxPoolSize=1&w=majority`;
        const client = new MongoClient(uri);
        await client.connect();
        this.connection = client;
      } catch (e) {
        console.log(e);
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
      const collection = database.collection(input["collection"]);
      const command = collection[input["command"]].bind(collection);
      resultSet = await command<any[]>(input[input["command"]]).toArray();
      return resultSet;
    } catch (e) {
      console.log(e);
    }
    return resultSet;
  }

  async getVersion() {
    return ''
  }

  query(query: string, page?: number, limit?: number): Promise<any> {
    return this.execute(
      query
        .replace(/:skip/g, String((page || 1) * (limit || 1))
          .replace(/:limit/, String(limit))
        ))
  }
}
