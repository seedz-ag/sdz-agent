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
import { Hydrator, Logger, Validator, ProgressBar } from "sdz-agent-common";

const callstack = async (config: Config) => {
  try {
    process.env.DEBUG = config.debug ? "true" : undefined;

    Logger.info("STARTING INTEGRATION CLIENT SEEDZ.");

    //validate(config);

    Logger.info("VALIDATING CLIENT FTP");

    const ftp1 = new FTP(config.ftp);
    await ftp1.connect();
    await ftp1.disconnect();

    const database = new Database(config.database);
    const entities: Entity[] = config.scope;

    const promises: Promise<boolean>[] = [];
    const respository = database.getRepository();

    const csv = new CSV(config.legacy);

    for (const entity of entities) {
      const promise = new Promise<boolean>(async (resolve, reject) => {
        try {
          // Logger.info(
          //   `BUSCANDO DADOS NO REPOSITORIO ${entity.name.toLocaleUpperCase()}`
          // );

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
          const countResponse = await respository[count]({ limit, page }, "T");
          let barProgress: any = "";
          if (response && response.length) {
            // Logger.info("CRIANDO ARQUIVO PARA TRANSMISSAO");
            if (!process.env.COMMAND_LINE) {
              barProgress = ProgressBar.create(
                entity.file,
                countResponse[0].total,
                0,
                {
                  color: `\u001b[33m`,
                  event: "WRITING",
                  text: entity.file,
                  unit: "Records",
                }
              );
            }

            while (0 < response.length) {
              await csv.write(
                file,
                response.map((row: DatabaseRow) => Hydrator(dto, row))
              );
              page++;
              response = await respository[method]({ limit, page }, "T");

              let updateProgress: any = page * limit;
              let difUpdateProgress = countResponse[0].total - page * limit;
              if (difUpdateProgress < limit) {
                if (!process.env.COMMAND_LINE) {
                  updateProgress = parseFloat(countResponse[0].total);
                  barProgress.update(updateProgress, {
                    event: "DONE",
                    count: `${updateProgress}/${countResponse[0].total}`,
                  });
                }
              }
              if (!process.env.COMMAND_LINE) {
                barProgress.increment();
                barProgress.update(updateProgress, {
                  count: `${updateProgress}/${countResponse[0].total}`,
                });
              }
            }

            if (fs.existsSync(file)) {
              // Logger.info("ENVIANDO DADOS VIA SFTP");
              const ftp = new FTP(config.ftp);
              await ftp.connect();
              await ftp.sendFile(entity.file, file);
              fs.unlinkSync(file);
            }
          }
          resolve(true);
        } catch (e) {
          reject(e);
        }
      });
      if (config.async) {
        promises.push(promise);
      } else {
        await Promise.resolve(promise);
      }
    }

    if (promises.length) {
      await Promise.all(promises);
    }

    ProgressBar.close();

    Logger.info("ENDING PROCESS");

    process.exit(1);
  } catch (e: any) {
    Logger.error(e.message);
    console.log(e);
  }
};

const validate = (config: Config) => {
  Logger.info("VALIDATING SETTINGS.");
  const validator = new Validator(config);
  validator.auth();
  validator.database();
};

export default callstack;
