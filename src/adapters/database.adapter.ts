import {
  DatabaseRow,
  IDatabaseAdapter,
} from "interfaces/database-adapter.interface";
import { MysqlAdapter } from "./mysql.adapter";
import { MssqlAdapter } from "./mssql.adapter";
import { FirebirdAdapter } from "./firebird.adapter";
import { OdbcAdapter } from "./odbc.adapter";
import { OracleAdapter } from "./oracle.adapter";
import { PostgresAdapter } from "./postgres.adapter";
import { singleton } from "tsyringe";
import { EnvironmentService } from "../services/environment.service";
import { LoggerAdapter } from "./logger.adapter";
import moment from "moment";
import { IParameter } from "interfaces/setting.interface";
import { DateTime } from "luxon";
import { MongodbAdapter } from "./mongodb.adapter";
import { ConfigDatabaseInterface } from "../interfaces/config-database.interface";


const DATABASE_ADAPTERS = {
  FIREBIRD: FirebirdAdapter,
  MYSQL: MysqlAdapter,
  MSSQL: MssqlAdapter,
  MONGODB: MongodbAdapter,
  ODBC: OdbcAdapter,
  ORACLE: OracleAdapter,
  POSTGRES: PostgresAdapter,
  REDSHIFT: PostgresAdapter,
};

type DatabaseDriver = keyof typeof DATABASE_ADAPTERS;

@singleton()
export class DatabaseAdapter implements IDatabaseAdapter {
  private adapter: IDatabaseAdapter;

  private config: ConfigDatabaseInterface;

  private driver: DatabaseDriver;

  private parameters: IParameter[] = [];

  constructor(
    private readonly environmentService: EnvironmentService,
    private readonly loggerAdapter: LoggerAdapter
  ) { }

  buildQuery(query: string): string {
    const parameters = [...this.parameters];

    const lastExtraction = String(
      parameters.find(({ Key }) => "LAST_EXTRACTION" === Key)?.Value
    );

    if (lastExtraction) {
      this.loggerAdapter.log(
        "info",
        `SETTING LAST_EXTRACTION ${lastExtraction}`
      );
    }
    const days =
      Number(this.environmentService.get("EXTRACT_LAST_N_DAYS")) ||
      Number(
        Math.ceil(
          Math.abs(
            DateTime.now().diff(
              DateTime.fromFormat(lastExtraction, "yyyy-LL-dd"),
              "days"
            ).days
          )
        )
      );

    this.loggerAdapter.log("info", `RESOLVED EXTRACTION N DAYS: ${days}`);

    if (days) {
      parameters.push({
        Key: "START_DATE",
        Value: `${moment()
          .subtract(days, "days")
          .format("YYYY-MM-DD")} 00:00:00`,
      });
    }

    return "function" === typeof this.adapter.buildQuery
      ? this.adapter.buildQuery(query, parameters)
      : this.defaultBuildQuery(query, parameters);
  }

  checkConnection() {
    return "function" === typeof this.adapter.checkConnection
      ? this.adapter.checkConnection()
      : this.defaultCheckConnection();
  }

  async connect(): Promise<void> {
    try {
      const driver = this.driver.toLocaleUpperCase() as keyof typeof DATABASE_ADAPTERS;

      this.adapter = new DATABASE_ADAPTERS[driver](this.config);
      // ATTEMPT TO CONNECT
      await this.adapter.connect();
    } catch (exception) {
      console.error({ exception });
      throw exception;
    }
  }

  private defaultBuildQuery(query: string, parameters: IParameter[]) {
    return parameters.reduce((query, { Key, Value }) => {
      return query.replace(new RegExp(`{${Key}}`, 'g'), Value);
    }, query);
  }

  async defaultCheckConnection(): Promise<boolean> {
    const [resultSet] = await this.execute("SELECT 1");
    return !!resultSet;
  }

  execute(query: string): Promise<any[]> {
    return this.adapter.execute(query);
  }

  async executeQueryRemote(query: string): Promise<any[] | unknown> {
    return this.adapter.executeQueryRemote?.(query) || [];
  }

  getVersion(): Promise<string> {
    return this.adapter.getVersion();
  }

  async initialize(
    driver: DatabaseDriver,
    config: ConfigDatabaseInterface,
    parameters: IParameter[]
  ) {
    this.driver = driver;
    this.config = config;
    this.parameters = parameters;
    await this.connect();
  }

  query(query: string, page?: number, limit?: number): Promise<DatabaseRow[]> {
    return this.adapter.query(this.buildQuery(query), page, limit);
  }
}
