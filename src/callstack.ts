import {
  Config,
  DatabaseRow,
  Entity,
  HydratorMapping,
  Repository,
} from "sdz-agent-types";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import fs from "fs";
import FTP from "sdz-agent-sftp";
import progress from "../src/utils/progress";
import chalk from "chalk";
import { Hydrator, Logger, Validator } from "sdz-agent-common";

const bootstrap = async (config: Config) => {
  try {
    process.env.DEBUG = config.debug ? "true" : undefined;

    Logger.info("INICIANDO CLIENTE DE INTEGRAÇÃO SEEDZ.");

    validate(config);

    Logger.info("VALIDANDO CONEXÃO FTP");

    const ftp1 = new FTP(config.auth.ftp);
    await ftp1.connect();
    await ftp1.disconnect();

    const database = new Database(config.database);
    const entities: Entity[] = config.scope;

    const promises = [];
    const respository = database.getRepository();

    const csv = new CSV();
    for (const entity of entities) {
      promises.push(
        new Promise(async (resolve, reject) => {
          try {
            Logger.info(
              `BUSCANDO DADOS NO REPOSITORIO ${entity.name.toLocaleUpperCase()}`
            );

            const dto = JSON.parse(
              fs
                .readFileSync(
                  `${__dirname}/../config/dto/${entity.name.toLocaleLowerCase()}.json`
                )
                .toString()
            ) as HydratorMapping;

            const file = entity.file;
            const limit = config.pageSize || 1000;
            const method = `get${entity.name}` as keyof Repository;
            const count = `count${entity.name}` as keyof Repository;
            let page = 1;
            let response = await respository[method]({ limit, page }, "T");
            const countResponse = await respository[count](
              { limit, page },
              "T"
            );

            if (response && response.length) {
              Logger.info("CRIANDO ARQUIVO PARA TRANSMISSAO");
              const barProgress = progress.create(countResponse[0].total, 0);

              while (0 < response.length) {
                await csv.write(
                  file,
                  response.map((row: DatabaseRow) => Hydrator(dto, row))
                );
                page++;
                response = await respository[method]({ limit, page }, "T");

                let updateProgress = page * limit;
                let difUpdateProgress = countResponse[0].total - page * limit;
                if (difUpdateProgress < limit) {
                  updateProgress = parseFloat(countResponse[0].total);
                }
                barProgress.increment();
                barProgress.update(updateProgress);
              }

              barProgress.stop();

              if (fs.existsSync(file)) {
                Logger.info("ENVIANDO DADOS VIA SFTP");
                const ftp = new FTP(config.auth.ftp);
                await ftp.connect();
                await ftp.sendFile(entity.file, file);
                fs.unlinkSync(file);
              }
            } else {
              Logger.info(
                `NAO FORAM ENCONTRADO DADOS NO REPOSITORIO ${entity.name.toLocaleUpperCase()}`
              );
            }
            resolve(true);
          } catch (e) {
            reject(e);
          }
        })
      );
    }

    await Promise.all(promises);

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
