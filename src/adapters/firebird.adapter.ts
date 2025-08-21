import * as databaseRowInterface from "../interfaces/database-row.interface";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";

import Firebird from "node-firebird";
import { IParameter } from "interfaces/setting.interface";

export class FirebirdAdapter implements IDatabaseAdapter {
  private connection: any
    ;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { 
    this.validateConfig();
  }

  private validateConfig(): void {
    const requiredFields = ["host", "port", "schema", "username", "password"];
    const missing = requiredFields.filter(field => 
      !this.config[field as keyof ConfigDatabaseInterface] || 
      String(this.config[field as keyof ConfigDatabaseInterface]).length === 0
    );

    if (missing.length) {
      const message = `Missing required database config for FIREBIRD: ${missing.join(", ")}`;
      throw new Error(message);
    }
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

  async checkConnection(): Promise<boolean> {
    try {
      if (!this.connection) {
        await this.connect();
      }
      const response = await new Promise(resolve => {
        this.connection.query("SELECT 1 as ok", function (err: any, result: any) {
          if (err) {
            resolve(false);
            return;
          }
          resolve(!!result);
        });
      })
      return !!response;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  disconnect(): Promise<void> {
    return this.connection.end();
  }

  async execute(query: string): Promise<databaseRowInterface.DatabaseRow[]> {
    let resultSet: databaseRowInterface.DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response = await new Promise(resolve => {
        this.connection.query(query, function (err: any, result: databaseRowInterface.DatabaseRow[]) {
          if (err) {
            throw err;
          }
          resolve(result);
        });
      })
      if (response) {
        resultSet = response as databaseRowInterface.DatabaseRow[];
      }
    } catch (e) {
      console.log(e);
    }
    return resultSet;
  }

  async executeQueryRemote(query: string): Promise<databaseRowInterface.DatabaseRow[] | unknown> {
    let resultSet: databaseRowInterface.DatabaseRow[] = [];
    if (!this.connection) {
      await this.connect();
    }
    try {
      const response = await new Promise(resolve => {
        this.connection.query(query, function (err: any, result: databaseRowInterface.DatabaseRow[]) {
          if (err) {
            throw err;
          }
          resolve(result);
        });
      })
      if (response) {
        resultSet = response as databaseRowInterface.DatabaseRow[];
      }
    } catch (e) {
      console.log(e);
      return e;
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
      query.replace(/^SELECT/gi, '')
    ].filter(v => !!v).join(' ')

    return this.execute(statement);
  }
}
