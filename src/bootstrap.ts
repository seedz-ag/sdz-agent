import { Config, Entity, HydratorMapping, Repository } from "sdz-agent-types";
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
      { file: "clientes.csv", name: "Clients", dto: "seedzCliente" },
    ];

    const respository = database.getRepository();

    const csv = new CSV();
    for (const entity of entities) {
      Logger.info("BUSCANDO DADOS NO REPOSITORIO");

      const dto = JSON.parse(
        fs.readFileSync(`./config/dto/${entity.dto}.json`).toString()
      ) as HydratorMapping;

      const file = entity.file;
      const limit = 1000;
      const method = `get${entity.name}` as keyof Repository;
      let page = 1;
      let response = await respository[method]({ limit, page });

      Logger.info("CRIANDO ARQUIVO PARA TRANSMISSAO");
      console.log(response);
      while (0 < response.length) {
        await csv.write(
          file,
          response.map((row) => Hydrator(dto, row))
        );
        page++;
        response = await respository[method]({ limit, page });
      }

      Logger.info("ENVIANDO DADOS VIA SFTP");
      await ftp.sendFile(entity.file, file);

      if (fs.existsSync(file)) {
        fs.unlink(file, (err) => {
          throw err;
        });
      }
    }

    Logger.info("ENCERRANDO PROCESSO");

    process.exit(1);
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
