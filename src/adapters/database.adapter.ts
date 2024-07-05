import {
  DatabaseRow,
  IDatabaseAdapter,
} from "interfaces/database-adapter.interface";
import {
  ConfigDatabaseInterface,
  // Connector,
  // DatabasePackage,
  // AbstractRepository,
} from "sdz-agent-types";
// import { RedshiftAdapter } from "./redshift.adapter";
import { MysqlAdapter } from "./mysql.adapter";
// import { MssqlAdapter } from "./mssql.adapter";
// import { FirebirdAdapter } from "./firebird.adapter";
// import { InformixAdapter } from "./informix.adapter";
// import { OdbcAdapter } from "./odbc.adapter";
// import { OracleAdapter } from "./oracle.adapter";
// import { PostgresAdapter } from "./postgres.adapter";
import { singleton } from "tsyringe";
import { EnvironmentService } from "../services/environment.service";
import { LoggerAdapter } from "./logger.adapter";
import moment from "moment";
import { IParameter } from "interfaces/setting.interface";
import { DateTime } from "luxon";

const DATABASE_ADAPTERS = {
  // FIREBIRD: FirebirdAdapter,
  // INFORMIX: InformixAdapter,
  MYSQL: MysqlAdapter,
  // MSSQL: MssqlAdapter,
  // ODBC: OdbcAdapter,
  // ORACLE: OracleAdapter,
  // POSTGRES: PostgresAdapter,
  // REDSHIFT: RedshiftAdapter,
};

type DatabaseDriver = keyof typeof DATABASE_ADAPTERS;

// import Firebird from "sdz-agent-database-firebird";
// import Informix from "sdz-agent-database-informix";

// import MongoDB from "sdz-agent-database-mongodb";
// import MSSQL from "sdz-agent-database-mssql";
// import MySQL from "sdz-agent-database-mysql";
// import Oracle from "sdz-agent-database-oracle";
// import ODBC from "sdz-agent-database-odbc";

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
    return "function" === typeof this.adapter.buildQuery
      ? this.adapter.buildQuery(query)
      : this.defaultBuildQuery(query);
  }

  checkConnection() {
    return "function" === typeof this.adapter.checkConnection
      ? this.adapter.checkConnection()
      : this.defaultCheckConnection();
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

  private defaultBuildQuery(query: string) {
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
        Key: "EXTRACT_LAST_N_DAYS",
        Value: `${moment()
          .subtract(days, "days")
          .format("YYYY-MM-DD")} 00:00:00`,
      });
    }

    return parameters.reduce((query, { Key, Value }) => {
      return query.replace(new RegExp(`/{${Key}}/g`), Value);
    }, query);
  }

  async defaultCheckConnection(): Promise<boolean> {
    const [resultSet] = await this.execute("SELECT 1");
    return !!resultSet;
  }

  execute(query: string): Promise<any[]> {
    return this.adapter.execute(query);
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
