import Axios, { AxiosRequestHeaders } from "axios";
Axios.defaults.timeout =  2000;

import Moment from "moment";
import { Hydrator } from "sdz-agent-common";
import Database from "sdz-agent-database";
import { TransportSeedz } from "sdz-agent-transport";

import Base from "./base";

class Protheus extends Base {

  /**
   * Create a new instance
   * 
   * @param {Database} database 
   * @param {TransportSeedz} transport 
   */
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
        `${Buffer.from(integration["user"], "base64").toString(
          "ascii"
        )}:${Buffer.from(integration["pass"], "base64").toString("ascii")}`
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
      WHERE i.tipo = 'totvs' AND i.email = 'liberado'
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
              maxContentLength: 100000000,
              maxBodyLength: 1000000000,
              url: integration["endpoint"],
            }).catch((e) => {
               // console.log('Error', e);
              return { data: [] };
            })
          ).data?.Vendas || [];
        if (response.length) {
          this.getTransport()
            .send(
              "notaFiscal",
              response.map((row: any) =>
                Hydrator(this.getDTO(), {
                  ...row,
                  Data: Moment(row["Data"], "DD/MM/YYYY").format("YYYY-MM-DD"),
                })
              )
            )
            .catch((e: any) => {
              console.log(e.response.data);
            });
        }
      }
    } catch {}
  }
}

export default Protheus;
