import chalk from "chalk";
import { QuestionResponse } from "sdz-agent-types";

const { MultiSelect, Select } = require("enquirer");

export default async () => {
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
      name: "PaymentsType",
      file: "especie_pagamento.csv",
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

  const prompt1 = new Select({
    name: "response",
    message: `What is your desired ${chalk.green(chalk.bold("SCOPE"))} type?`,
    initial: "maximum",
    choices: ["minimum", "maximum", "custom"],
  });

  const scopeType = await prompt1
    .run()

    console.log(scopeType)

  const prompt2 = new MultiSelect({
    name: "response",
    message: `What is your desired ${chalk.green(
      chalk.bold("SCOPE")
    )} entities?`,
    initial: choices.map((item) => item.name),
    choices,
    sort: true,
  });

  const scope = await prompt2.run()

  return {
    scope: choices
      .filter((item) => scope.includes(item.name))
      .map((item) => ({ file: item.file, name: item.name })),
    scopeType,
  };
};
