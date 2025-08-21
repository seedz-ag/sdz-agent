import { DatabaseRow } from "../interfaces/database-row.interface";
import mssql, { Connection, ConnectionPool } from "mssql";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";
import { IParameter } from "interfaces/setting.interface";

export class MssqlAdapter implements IDatabaseAdapter {
  private connection: ConnectionPool;

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
      const message = `Missing required database config for MSSQL: ${missing.join(", ")}`;
      throw new Error(message);
    }
  }

  public buildQuery(query: string, parameters: IParameter[]) {
    return parameters.reduce((query, { Key, Value }) => {
      return query.replace(new RegExp(`{${Key}}`, 'g'), Key !== "START_DATE" ? Value : `'${Value}'`);
    }, query);
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

  async connect(): Promise<any> {
    if (!this.connection) {
      try {
        this.connection = await mssql.connect({
          user: this.config.username,
          password: this.config.password,
          server: this.config.host || '',
          database: this.config.schema,
          port: Number(this.config.port),
          requestTimeout: 999999,
          options: {
            trustServerCertificate: true,
            encrypt: false,
          },
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
      const response = await this.connection.query("SELECT 1 as ok");
      return !!response;
    } catch (e) {
      console.log(e);
      return false;
    }
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }


  async execute(query: string): Promise<DatabaseRow[]> {
    if (!this.connection) {
      await this.connect();
    }
    try {
      let resultSet: DatabaseRow[] = [];
      const response = await this.connection.query(query);
      if (response) {
        resultSet = response.recordset;
      }
      return resultSet;
    } catch (exception) {
      console.log(exception)
      return []
    }
  }

  async executeQueryRemote(query: string): Promise<DatabaseRow[] | unknown> {
    if (!this.connection) {
      await this.connect();
    }
    try {
      let resultSet: DatabaseRow[] = [];
      const response = await this.connection.query(query);
      if (response) {
        resultSet = response.recordset;
      }
      return resultSet;
    } catch (exception) {
      console.log(exception)
      return exception
    }
  }

  async getVersion(): Promise<string> {
    return ''
  }

  query(query: string, page?: number, limit?: number): Promise<any> {
    if(!query.toLocaleUpperCase().includes('ORDER BY')) {
      const statement = [
        query,
        "undefined" !== typeof page && limit ? `ORDER BY TIPOQUERY ASC, R_E_C_N_O_ ASC OFFSET ${page * limit} ROWS FETCH NEXT ${limit} ROWS ONLY` : null,
      ]
        .filter((item) => !!item)
        .join(" ");
      return this.execute(statement);
    }

    if (typeof page !== "undefined" && limit) {
        const orderByQuery = `OFFSET ${page * limit} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        const statement = [query, orderByQuery].filter((item) => !!item).join(" ");
        return this.execute(statement);
    }

    return this.execute(query); 
    }
}
