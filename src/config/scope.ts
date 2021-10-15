import chalk from "chalk";
import ConfigScope from "sdz-agent-types/types/config.scope.type";

const { MultiSelect, Select } = require("enquirer");

export default async (config: ConfigScope | undefined): Promise<any> => {
  const choices = [
    {
      name: "Clients",
      file: "cliente.csv",
    },
    {
      name: "Address",
      file: "endereco.csv",
    },
    {
      name: "Properties",
      file: "propriedade.csv",
    },
    {
      name: "Items",
      file: "item.csv",
    },
    {
      name: "ItemsBranding",
      file: "item_branding.csv",
    },
    {
      name: "ItemsGroup",
      file: "item_grupo.csv",
    },
    {
      name: "Orders",
      file: "pedido.csv",
    },
    {
      name: "OrdersItem",
      file: "pedido_item.csv",
    },
    {
      name: "Invoices",
      file: "faturamento.csv",
    },
    {
      name: "InvoicesItem",
      file: "faturamento_item.csv",
    },
    {
      name: "PaymentsSpecie",
      file: "especie_pagamento.csv",
    },
    {
      name: "PaymentsCondition",
      file: "condicao_pagamento.csv",
    },
    {
      name: "Providers",
      file: "fornecedor.csv",
    },
    {
      name: "AccountsPay",
      file: "contas_pagar.csv",
    },
    {
      name: "AccountsReceivable",
      file: "contas_receber.csv",
    },
    {
      name: "Vendors",
      file: "vendedor.csv",
    },
    {
      name: "Employees",
      file: "funcionario.csv",
    },
    {
      name: "Inventories",
      file: "estoque.csv",
    },
  ];

  const prompt1 = new MultiSelect({
    name: "response",
    message: `What is your desired ${chalk.green(
      chalk.bold("SCOPE")
    )} entities?`,
    initial:
      (config && config.length > 0 && config.map((item) => item.name)) ||
      choices.map((item) => item.name),
    choices: choices,
    sort: true,
  });
  const scope = await prompt1.run();

  return {
    scope: choices
      .filter((item) => scope.includes(item.name))
      .map((item) => ({ file: item.file, name: item.name })),
  };
};
