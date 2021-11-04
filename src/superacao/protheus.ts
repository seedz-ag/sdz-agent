import Axios, { AxiosRequestHeaders } from "axios";
import Moment from "moment";
import { Hydrator } from "sdz-agent-common";
import Database from "sdz-agent-database";
import { TransportSeedz } from "sdz-agent-transport";

import Base from "./base";

class Protheus extends Base {
  constructor(database: Database, transport: TransportSeedz) {
    super(database, transport);
    this.setDTO(`${process.cwd()}/src/superacao/dto-protheus.json`);
  }

  /**
   * Functions
   */
  private composeHeaders(integration: any): AxiosRequestHeaders {
    const headers: AxiosRequestHeaders = {
      Authorization: `Basic ${Buffer.from(
        `${Buffer.from(integration["user"]).toString("ascii")}:${Buffer.from(
          integration["pass"]
        ).toString("ascii")}`
      ).toString("base64")}`,
      emp: integration["emp"],
      pass: integration["pass"],
      user: integration["user"],
      inicial: Moment().format("YYYYMMDD"),
      final: Moment().format("YYYYMMDD"),
    };
    if (integration["filial"]) {
      headers.fil = integration["filial"];
    }
    return headers;
  }

  async getList(): Promise<any[]> {
    return await this.getDatabase().getConnector().execute(`
      SELECT i.grupo, i.endpoint, i.user, i.pass, id.filial, i.id, i.emp
      FROM jd_setup_integration i
      LEFT JOIN jd_setup_integration_detail id ON id.jd_setup_integration = i.id
      WHERE i.tipo = 'totvs' AND i.email = 'liberado' and if(:pgrupo = 'ALL', TRUE, grupo = :pgrupo)
    `);
  }

  async process() {
    try {
      const integrations = await this.getList();
      for (const integration of integrations) {
        const headers = this.composeHeaders(integration);
        const response =
          (
            await Axios.request({
              headers,
              url: integration["endpoint"],
            })
          ).data?.Vendas || [];
        for (const row of response) {
          const dto = Hydrator(this.getDTO(), row);
          this.getTransport().send(
            "superacao",
            Hydrator(this.getDTO(), {
              ...row,
              Data: Moment(row["Data"], "DD/MM/YYYY").format("YYYY-MM-DD"),
            })
          );
        }
      }
    } catch {}
  }
}

export default Protheus;
