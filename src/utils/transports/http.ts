import { TransportSeedz } from "sdz-agent-transport";
import writeJson from "../write-json";

let instance: TransportSeedz;

const transport = (entity: string, payload: any) => {
  writeJson(entity, payload);
  return transport.getInstance().send(entity, payload);
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
      pedidoItem: "orders-items",
      pedido: "orders",
      especiePagamento: "payment-species",
      condicaoPagamento: "payment-conditions",
      fornecedor: "suppliers",
      contasPagar: "account-payables",
      contasReceber: "account-receivables",
      vendedor: "sellers",
      funcionario: "employees",
      cliente: "customers",
      endereco: "addresses",
      propriedade: "properties",
    });
  }
  return instance;
};

export default transport;
