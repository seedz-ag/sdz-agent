import { DatabaseRow, IDatabaseAdapter } from "interfaces/database-adapter.interface";
import {
  ConfigDatabaseInterface,
  Connector,
  DatabasePackage,
  AbstractRepository,
} from "sdz-agent-types";
import { RedshiftAdapter } from "./redshift.adapter";

const DATABASE_ADAPTERS = {
  REDSHIFT: RedshiftAdapter,
};

type DatabaseDriver = keyof typeof DATABASE_ADAPTERS;

// import Firebird from "sdz-agent-database-firebird";
// import Informix from "sdz-agent-database-informix";

// import MongoDB from "sdz-agent-database-mongodb";
// import MSSQL from "sdz-agent-database-mssql";
// import MySQL from "sdz-agent-database-mysql";
// import Oracle from "sdz-agent-database-oracle";
// import ODBC from "sdz-agent-database-odbc";

export class DatabaseAdapter implements IDatabaseAdapter {
  private adapter: IDatabaseAdapter;

  constructor(
    private readonly driver: DatabaseDriver,
    private readonly config: ConfigDatabaseInterface
  ) { }

  buildQuery(query: string): string {
    return this.adapter.buildQuery(query);
  }

  async connect(): Promise<void> {
    try {
      this.adapter = new DATABASE_ADAPTERS[this.driver](this.config);
      // ATTEMPT TO CONNECT
      await this.adapter.connect();
    } catch (exception) {
      console.error({ exception });
    }
  }

  count(query: string): Promise<number> {
    return this.adapter.count(query);
  }

  async disconnect(): Promise<void> {
    try {
      await this.adapter.disconnect();
    } catch (exception) {
      console.error({ exception });
    }
  }

  execute(query: string): Promise<any[]> {
    return this.adapter.execute(query);
  }

  getVersion(): Promise<string> {
    return this.adapter.getVersion();
  }

  query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]> {
    return this.adapter.query(query, page, limit);
  }
}
