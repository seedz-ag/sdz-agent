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
    if (!informixConnect) {
      try {
        informixConnect = informix.openSync(this.dsn);
      } catch (e) {
        console.log(e);
      }
    }
  }


  disconnect(): Promise<void> {
    return this.connection.end();
  }

  async execute(query: string): Promise<DatabaseRow[]> {
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
