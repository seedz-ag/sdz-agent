import { DatabaseRow } from "sdz-agent-types";
import oracledb, { Connection } from "oracledb";
import { IDatabaseAdapter } from "interfaces/database-adapter.interface";
import { ConfigDatabaseInterface } from "sdz-agent-types";

export class OracleAdapter implements IDatabaseAdapter {
  private connection: Connection;
  private version: any;

  constructor(private readonly config: ConfigDatabaseInterface) { }

  buildQuery(query): string {
    return query;
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
        oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
        this.connection = await oracledb.getConnection({
          user: this.config.username,
          password: this.config.password,
          connectString: `${this.config.host}:${this.config.port}/${this.config.service}`,
        });
        await this.connection.execute(
          `ALTER SESSION SET CURRENT_SCHEMA = ${this.config.schema}`
        );
      } catch (e) {
        console.log(e);
      }
    }
  }

  async count(query: string): Promise<any> {
    const total = (
      await this.execute(
        `SELECT COUNT (*) as total FROM (${this.buildQuery(query)})`
      )
    )[0].TOTAL;
    return total;
  }

  disconnect(): Promise<void> {
    return this.connection.close();
  }

  async execute(query: string, page?: number, limit?: number): Promise<any> {
    if (!this.version) {
      this.version = Number(await this.getVersion())
    }
    if (+this.version > 11) {
      const statement = [
        this.buildQuery(query),
        page && limit ? `OFFSET ${page * limit} ROWS` : null,
        limit ? `FETCH NEXT ${limit} ROWS ONLY` : null,
      ]
        .filter((item) => !!item)
        .join(" ");
      return await this.connection.execute(statement);
    }
    let tmp: any = query.split(/from/gi);
    tmp[0] = `${tmp[0]}, ROWNUM AS OFFSET `;
    tmp = tmp.join("FROM");
    const statement = [
      `SELECT * FROM (${tmp})`,
      limit ? `WHERE OFFSET  > ${Math.max(page, 0) * limit}` : null,
      limit ? `AND OFFSET <= ${Math.max(page + 1, 1) * limit}` : null,
    ]
      .filter((item) => !!item)
      .join(" ");
    return await this.connection.execute(statement);
  }

  async getVersion() {
    if (!this.connection) {
      await this.connect();
    }
    if (!this.version) {
      const query = "SELECT * FROM PRODUCT_COMPONENT_VERSION";
      const { rows } = await this.connection.execute<DatabaseRow[]>(query);
      this.version = rows ? rows[0]["VERSION"].split(".").shift() : "";
    }

    return this.version;
  }



  query(query: string, page?: number, limit?: number): Promise<any> {
    const statement = [
      query,
      limit ? `LIMIT ${limit}` : null,
      page && limit ? `OFFSET ${page * limit}` : null,
    ]
      .filter((item) => !!item)
      .join(" ");
    return this.query(statement);
  }
}
