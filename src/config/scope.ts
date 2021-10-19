import chalk from "chalk";
import { QuestionResponse } from "sdz-agent-types";
import ConfigScope from "sdz-agent-types/types/config.scope.type";

const { MultiSelect, Select } = require("enquirer");

export default async (config: ConfigScope | undefined) => {
  const choices = [
    {
      name: "Clients",
      file: "cliente.csv",
      entity: "cliente",
    },
    {
      name: "Address",
      file: "endereco.csv",
      entity: "endereco",
    },
    {
      name: "Properties",
      file: "propriedade.csv",
      entity: "propriedade",
    },
    {
      name: "Items",
      file: "item.csv",
      entity: "item",
    },
    {
      name: "ItemsBranding",
      file: "item_branding.csv",
      entity: "item_branding",
    },
    {
      name: "ItemsGroup",
      file: "item_grupo.csv",
      entity: "item_grupo",
    },
    {
      name: "Orders",
      file: "pedido.csv",
      entity: "pedido",
    },
    {
      name: "OrdersItem",
      file: "pedido_item.csv",
      entity: "pedido_item",
    },
    {
      name: "Invoices",
      file: "faturamento.csv",
      entity: "faturamento",
    },
    {
      name: "InvoicesItem",
      file: "faturamento_item.csv",
      entity: "faturamento_item",
    },
    {
      name: "PaymentsSpecie",
      file: "especie_pagamento.csv",
      entity: "especie_pagamento",
    },
    {
      name: "PaymentsCondition",
      file: "condicao_pagamento.csv",
      entity: "condicao_pagamento",
    },
    {
      name: "Providers",
      file: "fornecedor.csv",
      entity: "fornecedor",
    },
    {
      name: "AccountsPay",
      file: "contas_pagar.csv",
      entity: "contas_pagar.csv",
    },
    {
      name: "AccountsReceivable",
      file: "contas_receber.csv",
      entity: "contas_receber.csv",
    },
    {
      name: "Vendors",
      file: "vendedor.csv",
      entity: "vendedor.csv",
    },
    {
      name: "Employees",
      file: "funcionario.csv",
      entity: "funcionario.csv",
    },
    {
      name: "Inventories",
      file: "estoque.csv",
      entity: "estoque.csv",
    },
  ];

  const prompt1 = new Select({
    name: "response",
    message: `What is your desired ${chalk.green(chalk.bold("SCOPE"))} type?`,
    initial: "maximum",
    choices: ["minimum", "maximum", "custom"],
  });

  const scopeType = await prompt1.run();

  const prompt2 = new MultiSelect({
    name: "response",
    message: `What is your desired ${chalk.green(
      chalk.bold("SCOPE")
    )} entities?`,
    initial: config?.map((item) => item.name) || choices.map((item) => item.name),
    choices,
    sort: true,
  });

  const scope = await prompt2.run();

  return {
    scope: choices
      .filter((item) => scope.includes(item.name))
      .map((item) => ({ file: item.file, name: item.name, entity: item.entity })),
    scopeType,
  };
};
