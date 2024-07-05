import { DatabaseRow } from "sdz-agent-types";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

import Firebird from "node-firebird";

export class FirebirdAdapter implements IDatabaseAdapter {
  private connection: any
    ;
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

  async connect(): Promise<any> {
    if (!this.connection) {
      try {
        const connectionString = {
          host: this.config.host,
          port: this.config.port,
          database: this.config.schema,
          user: this.config.username,
          password: this.config.password,
          lowercase_keys: false, // set to true to lowercase keys
          pageSize: 4096,        // default when creating database
          retryConnectionInterval: 1000 // reconnect interval in case of connection drop
        }

        this.connection = await new Promise(resolve => {
          Firebird.attach(connectionString, function (err, db) {
            if (err) {
              throw err;
            }
            resolve(db);
            return db;
          });
        })
      } catch (e) {
        console.log(e);
      }
    }
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
      const response = await new Promise(resolve => {
        this.connection.query(query, function (err: any, result: DatabaseRow[]) {
          if (err) {
            throw err;
          }
          resolve(result);
        });
      })
      if (response) {
        resultSet = response as DatabaseRow[];
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
      "SELECT",
      limit && `FIRST ${limit}`,
      limit && page && `SKIP ${limit * page}`,
      this.buildQuery(query).replace(/^SELECT/gi, '')
    ].filter(v => !!v).join(' ')

    return this.execute(statement);
  }
}
