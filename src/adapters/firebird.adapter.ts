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
        this.connection = await new Promise(resolve => {
          Firebird.attach(this.config, function (err, db) {
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

  async count(entity) {
    const resultSet = await this.execute(`SELECT COUNT (*) as total FROM (${this.buildQuery(entity)}) as total`);
    const obj = {};

    Object.keys(resultSet).map((key) => obj[key.toLowerCase()] = resultSet[key]);
    return obj[0].TOTAL;
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
        this.connection.query(query, function (err, result) {
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

    return this.getConnector().execute(statement);
  }

  private setConfig(config: any): this {
    const options: any = {};
    options.host = config.host;
    options.port = config.port;
    options.database = config.schema;
    options.user = config.username;
    options.password = config.password;
    options.lowercase_keys = false; // set to true to lowercase keys
    options.role = null;            // default
    options.pageSize = 4096;        // default when creating database
    options.pageSize = 4096;        // default when creating database
    options.retryConnectionInterval = 1000; // reconnect interval in case of connection drop
    this.config = { ...options };
    return this;
  }
}
