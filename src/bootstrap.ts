import { Config, Entity, Repository } from "sdz-agent-types";
import ConfigJson from "../config/index";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import fs from "fs";
import FTP from "sdz-agent-sftp";
import { Logger, Validator } from "sdz-agent-common";

const bootstrap = async (config: Config) => {
  try {
    Logger.info("INICIANDO CLIENTE DE INTEGRAÇÃO SEEDZ.");
    validate(config);

    Logger.info("VALIDANDO CONEXÃO FTP");
    const ftp = new FTP(config.auth.ftp);
    await ftp.connect();
    // Logger.info("ENCERRANDO CONEXÃO FTP");

    const database: Database = new Database(config.database);
    const entities: Entity[] = [{ file: "clientes.csv", name: "Clients" }];

    const respository: Repository = database.getRepository();

    const csv: CSV = new CSV();

    for (const entity of entities) {
      const file = entity.file;
      const limit = 1000;
      let page = 1;
      let response = await respository[`get${entity.name}`]({ limit, page });

      while (0 < response.length) {
        await csv.write(file, response);
        page++;
        response = await respository[`get${entity.name}`]({ limit, page });
      }

      Logger.info("ENVIANDO DADOS VIA FTP");
      await ftp.sendFile(entity.file, file);

      if (fs.existSync(file)) {
        fs.unlink(file);
      }
    }

    // Logger.info("EXECUTANDO SHELL SCRIPT");
    //const shell = shelljs.exec('ping -c 4 8.8.8.8').code
    // const shell = shelljs.exec("./files/EXAMPLE.sh").code;
    // if (shell !== 0) {
    //   Logger.error("ERRO AO EXECUTAR ARQUIVO SH");
    //   process.exit(1);
    // }

    // Logger.info("ENVIANDO DADOS XXX VIA FTP");
    // const ftp3 = new FTP(config.auth.ftp);
    // await ftp3.connect();
    // const estoque = "EXAMPLE.csv";
    // const sendFile = await ftp3.sendFile("./files/EXAMPLE.csv", "EXAMPLE.csv");

    Logger.info("ENCERRANDO PROCESSO");
  } catch (e: any) {
    Logger.error(e.message);
    console.log(e);
  }
};

export default bootstrap;

const validate = (config: Config) => {
  Logger.info("VERIFICANDO CONFIGURAÇÕES.");
  const validator = new Validator(config);
  validator.auth();
  validator.database();
};

bootstrap(ConfigJson);
