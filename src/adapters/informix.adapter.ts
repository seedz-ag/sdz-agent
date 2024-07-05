import { DatabaseRow } from "sdz-agent-types";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

import informix from "informixdb";

let informixConnect: any;

export class InformixAdapter implements IDatabaseAdapter {
  private connection: any;
  private version: any;
  private dsn: any;


  constructor(private readonly config: ConfigDatabaseInterface) { }

  close() {
    if (informixConnect) {
      try {
        informixConnect.closeSync();
      } catch (e) {
        console.log(e);
      }
    }
  }

  async connect() {
    const options = {
      host: this.config.host,
      port: this.config.port,
      database: this.config.schema,
      user: this.config.username,
      password: this.config.password,
      lowercase_keys: false, // set to true to lowercase keys
      role: null,            // default
      pageSize: 4096,        // default when creating database
      retryConnectionInterval: 1000 // reconnect interval in case of connection drop
    }
    if (!informixConnect) {
      try {
        informixConnect = await informix.openSync(options);
      } catch (e) {
        console.log(e);
      }
    }
  }


  disconnect(): Promise<void> {
    return this.connection.end();
  }

  async execute(query: string): Promise<any> {
    let resultSet = [];
    if (!informixConnect) {
      this.connect();
    }
    try {
      resultSet = informixConnect.querySync(query);
      return resultSet;
    } catch (e) {
      console.log(e);
    }
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

    return this.connection.execute(statement);
  }

}
