import chalk from "chalk";
import { QuestionResponse } from "sdz-agent-types";
import ConfigScope from "sdz-agent-types/types/config.scope.type";

const { MultiSelect, Select } = require("enquirer");

export default async (config: ConfigScope | undefined): Promise<any> => {
  const choices = {
    maximum: [
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
    ],
    minimum: [
      {
        name: "Clients",
        file: "cliente.csv",
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
        name: "AccountsReceivable",
        file: "contas_receber.csv",
      },
    ],
  };

  const prompt1 = new Select({
    name: "response",
    message: `What is your desired ${chalk.green(chalk.bold("SCOPE"))} type?`,
    initial: "maximum",
    choices: ["minimum", "maximum", "custom"],
  });

  let scope: string[];
  let type: string = await prompt1.run();

  switch (type) {
    case "maximum":
    case "minimum":
      scope = choices[type].map((item) => item.name);
      break;
    case "custom":
      const prompt2 = new MultiSelect({
        name: "response",
        message: `What is your desired ${chalk.green(
          chalk.bold("SCOPE")
        )} entities?`,
        initial:
          (config && config.length > 0 && config.map((item) => item.name)) ||
          choices["maximum"].map((item) => item.name),
        choices: choices["maximum"],
        sort: true,
      });
      scope = await prompt2.run();
      type = "maximum";
      break;
  }

  return {
    scope: choices["maximum"]
      .filter((item) => scope.includes(item.name))
      .map((item) => ({ file: item.file, name: item.name })),
    type,
  };
};
