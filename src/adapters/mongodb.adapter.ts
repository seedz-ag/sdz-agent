import { DatabaseRow } from "../interfaces/database-row.interface";
import { MongoClient } from "mongodb";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

export class MongodbAdapter implements IDatabaseAdapter {
  private connection: MongoClient;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { 
    this.validateConfig();
  }

  private validateConfig(): void {
    const requiredFields = ["host", "schema", "username", "password"];
    const missing = requiredFields.filter(field => 
      !this.config[field as keyof ConfigDatabaseInterface] || 
      String(this.config[field as keyof ConfigDatabaseInterface]).length === 0
    );

    if (missing.length) {
      const message = `Missing required database config for MONGODB: ${missing.join(", ")}`;
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

  async checkConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.connect();
      }
      const admin = this.connection.db(this.config.schema).admin();
      const ping = await admin.ping();
      return !!ping;
    } catch (e) {
      console.log(e);
      return false;
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
      const input = JSON.parse(query);
      const database = this.connection.db(this.config.schema);
      const collection: any = database.collection(input["collection"]);
      const command: any = collection[input["command"]].bind(collection);
      resultSet = await (command)(input[input["command"]]).toArray();
      return resultSet;
    } catch (e) {
      console.log(e);
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
