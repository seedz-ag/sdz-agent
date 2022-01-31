import {
  Config,
  DatabaseRow,
  Entity,
  HydratorMapping,
  AbstractRepository,
} from "sdz-agent-types";
import CSV from "sdz-agent-data";
import Database from "sdz-agent-database";
import fs from "fs";
import FTP from "sdz-agent-sftp";
import { Hydrator, Logger, Validator, ProgressBar } from "sdz-agent-common";
import ws from "./websocket/client";
import OpenIdClient from "./open-id";
import { TransportSeedz } from "sdz-agent-transport";

require("dotenv").config();

const callstack = async (config: Config) => {
  try {
    process.env.DEBUG = config.debug ? "true" : undefined;

    Logger.info("STARTING INTEGRATION CLIENT SEEDZ.");

    //validate(config);
    Logger.info("VALIDATING CLIENT FTP");

    const ftp1 = new FTP(config.ftp);
    await ftp1.connect();
    //await ftp1.disconnect();
    // console.log(config.database)

    let transport = new TransportSeedz(
      String(process.env.ISSUER_URL),
      String(process.env.API_URL)
    );
    transport.setUriMap({
      inventories: "inventories",
      invoices: "invoices",
      "invoices-item": "invoice-items",
      items: "items",
      "items-branding": "brands",
      "items-group": "groups",
    });
    if (
      !config.legacy &&
      process.env["CLIENT_ID"] &&
      process.env["CLIENT_SECRET"] &&
      process.env["ISSUER_URL"]
    ) {
      !!OpenIdClient.getToken() && (await OpenIdClient.connect());
      OpenIdClient.addSubscriber(transport.setToken.bind(transport));
      await OpenIdClient.grant();
    }

    const database = new Database(config.database);
    const entities: Entity[] = config.scope;

    const promises: Promise<boolean>[] = [];
    const respository: any = database.getRepository();

    const csv = new CSV(config.legacy, config.fileSize);

    for (const entity of entities) {
      const promise = new Promise<boolean>(async (resolve, reject) => {
        try {
          const baseDir = process.env.CONFIGDIR;

          const dto = await ws.getDTO(entity.name.toLocaleLowerCase());
          const sql = await ws.getSQL(entity.name.toLocaleLowerCase());

          const file = `${process.cwd()}/${entity.file}`;
          const limit = config.pageSize || 1000;
          const method = `get${entity.name}` as keyof AbstractRepository;
          const count = `count${entity.name}` as keyof AbstractRepository;
          let page = 0;
          let response = await respository[method](page, limit);
          const countResponse = await respository[count]();
          let barProgress: any = "";
          if (response && response.length) {
            if (!process.env.COMMAND_LINE) {
              barProgress = ProgressBar.create(entity.file, countResponse, 0, {
                color: `\u001b[33m`,
                event: "WRITING",
                text: entity.file,
                unit: "Records",
              });
            }

            while (0 < response.length) {
              if (OpenIdClient.getToken()) {
                transport.send(
                  entity.entity,
                  response.map((row: DatabaseRow) => Hydrator(dto, row))
                );
              } else {
                await csv.write(
                  file,
                  response.map((row: DatabaseRow) => Hydrator(dto, row))
                );
              }
              page++;
              response = await respository[method](page, limit);

              let updateProgress: any = page * limit;
              let difUpdateProgress = countResponse - page * limit;
              if (difUpdateProgress < limit) {
                if (!process.env.COMMAND_LINE) {
                  updateProgress = parseFloat(countResponse);
                  barProgress.update(updateProgress, {
                    event: "DONE",
                    count: `${updateProgress}/${countResponse}`,
                  });
                }
              }
              if (!process.env.COMMAND_LINE) {
                barProgress.increment();
                barProgress.update(updateProgress, {
                  count: `${updateProgress}/${countResponse}`,
                });
              }
            }

            if (!OpenIdClient.getToken()) {
              const newFile = entity.file.split(/\.(?=[^\.]+$)/);
              const files = fs
                .readdirSync(`${process.cwd()}`)
                .filter((file) => {
                  if (file.includes(newFile[0])) {
                    return true;
                  }
                });

              for (const newFiles of files) {
                if (fs.existsSync(`${process.cwd()}/${newFiles}`)) {
                  // Logger.info("ENVIANDO DADOS VIA SFTP");
                  const ftp = new FTP(config.ftp);
                  // await ftp.connect();
                  await ftp.sendFile(`${process.cwd()}/${newFiles}`, newFiles);
                  fs.existsSync(`${process.cwd()}/${newFiles}`) &&
                    fs.unlinkSync(`${process.cwd()}/${newFiles}`);
                }
              }
            }
          }
          resolve(true);
        } catch (e) {
          reject(e);
        }
      });
      (config.async && promises.push(promise)) ||
        (await Promise.resolve(promise));
    }

    !config.async && (await Promise.all(promises));

    ProgressBar.close();

    Logger.info("ENDING PROCESS");
    process.exit(0);
  } catch (e: any) {
    Logger.error(e.message);
  }
};

const validate = (config: Config) => {
  Logger.info("VALIDATING SETTINGS.");
  const validator = new Validator(config);
  validator.auth();
  validator.database();
};

export default callstack;
