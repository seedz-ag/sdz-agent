import { TransportSeedz } from "sdz-agent-transport";
import writeJson from "../write-json";

let instance: TransportSeedz;

const transport = (entity: string, payload: any) => {
  writeJson(entity, payload);
  return instance.send(entity, payload);
};

transport.getInstance = () => {
  if (!instance) {
    instance = new TransportSeedz(
      String(process.env.ISSUER_URL),
      String(process.env.API_URL)
    );
    instance.setUriMap({
      faturamento: "invoices",
      faturamentoItem: "invoice-items",
      estoque: "inventories",
      item: "items",
      itemGrupo: "groups",
      itemBranding: "brands",
    });
  }
  return instance;
};

export default transport;
