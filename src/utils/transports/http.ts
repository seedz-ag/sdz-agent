import writeJson from "../write-json";
import { TransportSeedz } from "sdz-agent-transport";

const instance = new TransportSeedz(
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

const transport = (entity: string, payload: any) => {
  writeJson(entity, payload);
  return instance.send(entity, payload);
};

transport.getInstance = () => instance;

export default transport;
