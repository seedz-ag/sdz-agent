import {
  Config,
  DatabaseRow,
  Entity,
  HydratorMapping,
  Repository,
} from "sdz-agent-types";
import ConfigJson from "../config/index";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import fs from "fs";
import FTP from "sdz-agent-sftp";
import { Hydrator, Logger, Validator } from "sdz-agent-common";

const bootstrap = async (config: Config) => {
  try {
    Logger.info("INICIANDO CLIENTE DE INTEGRAÇÃO SEEDZ.");

    validate(config);

    Logger.info("VALIDANDO CONEXÃO FTP");

    const ftp = new FTP(config.auth.ftp);
    await ftp.connect();

    const database = new Database(config.database);
    const entities: Entity[] = [
      // { file: "test.csv", name: "Test", dto: "test" },
      { file: "cliente.csv", name: "Clients", dto: "clientes" },
      { file: "endereco.csv", name: "Address", dto: "enderecos" },
      { file: "propriedade.csv", name: "Property", dto: "propriedades" },
      { file: "item.csv", name: "Item", dto: "item" },
      { file: "item_branding.csv", name: "ItemBranding", dto: "itemBranding" },
      { file: "item_grupo.csv", name: "ItemGroup", dto: "itemGrupo" },
      { file: "pedido.csv", name: "Request", dto: "pedido" },
      { file: "pedido_item.csv", name: "RequestItem", dto: "pedidoItem" },
      { file: "faturamento.csv", name: "Invoices", dto: "faturamento" },
      {
        file: "faturamento_item.csv",
        name: "BillingItem",
        dto: "faturamentoItem",
      },
      {
        file: "especie_pagamento.csv",
        name: "PaymentType",
        dto: "especiePagamento",
      },
      { file: "fornecedor.csv", name: "Provider", dto: "fornecedor" },
      { file: "contas_pagar.csv", name: "AccountPay", dto: "contasPagar" },
      {
        file: "contas_receber.csv",
        name: "AccountReceivable",
        dto: "contasReceber",
      },
      { file: "vendedor.csv", name: "Vendor", dto: "vendedor" },
      { file: "funcionario.csv", name: "Employee", dto: "funcionario" },
      { file: "estoque.csv", name: "Inventory", dto: "estoque" },
    ];

    const respository = database.getRepository();

    const csv = new CSV();
    for (const entity of entities) {
      Logger.info(
        `BUSCANDO DADOS NO REPOSITORIO ${entity.name.toLocaleUpperCase()}`
      );

      const dto = JSON.parse(
        fs.readFileSync(`./config/dto/${entity.dto}.json`).toString()
      ) as HydratorMapping;

      const file = entity.file;
      const limit = 1000;
      const method = `get${entity.name}` as keyof Repository;
      let page = 1;
      let response = await respository[method]({ limit, page }, "T");
      if (response) {
        //console.log(response);
        Logger.info("CRIANDO ARQUIVO PARA TRANSMISSAO");

        while (0 < response.length) {
          await csv.write(
            file,
            response.map((row: DatabaseRow) => Hydrator(dto, row))
          );
          page++;
          response = await respository[method]({ limit, page }, "T");
        }

        Logger.info("ENVIANDO DADOS VIA SFTP");
        await ftp.sendFile(entity.file, file);

        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
        }
      } else {
        Logger.warning(
          `ERRO AO BUSCAR DADOS NO REPOSITORIO ${entity.name.toLocaleUpperCase()}`
        );
      }
    }

    Logger.info("ENCERRANDO PROCESSO");

    process.exit(1);
  } catch (e: any) {
    Logger.error(e.message);
    console.log(e);
  }
};

const validate = (config: Config) => {
  Logger.info("VERIFICANDO CONFIGURAÇÕES.");
  const validator = new Validator(config);
  validator.auth();
  validator.database();
};

export default bootstrap;
