import { Config, DatabaseRow, Entity, HydratorMapping } from "sdz-agent-types";
import { Hydrator, Logger, ProgressBar, Validator } from "sdz-agent-common";

import Database from "sdz-agent-database";
import csv from "../csv";
import fs from "fs";
import ftpTransport from "../transports/ftp";
import httpTransport from "../transports/http";
import ws from "../../websocket/client";

let config: Config;

const consumer = async () => {
  const database = new Database(config.database);
  const entities: Entity[] = config.scope;

  const respository: any = database.getRepository();
  for (const entity of entities) {
    Logger.info(entity.name.toLocaleUpperCase());

    const dto = (config?.dtos?.[entity.name.toLocaleLowerCase()] ||
      (await ws.getDTO(entity.name.toLocaleLowerCase()))) as HydratorMapping;
    const sql =
      config?.sqls?.[entity.name.toLocaleLowerCase()] ||
      (await ws.getSQL(entity.name.toLocaleLowerCase()));
    const file = `${process.cwd()}/output/${entity.file}`;
    const limit = config.pageSize || 1000;
    let page = 0;

    let response = await respository.execute(sql);
    const countResponse = await respository.count(sql);

    let barProgress: any = "";
    if (response && response.length) {
      if (!process.env.COMMAND_LINE || process.env.COMMAND_LINE === "false") {
        barProgress = ProgressBar.create(entity.name, countResponse, 0, {
          color: `\u001b[33m`,
          event: "WRITING",
          text: entity.name,
          unit: "Records",
        });
      }
      while (0 < response.length) {
        if (!config.legacy) {
          await httpTransport(
            entity.entity,
            response.map((row: DatabaseRow) => Hydrator(dto, row))
          );
        } else {
          await csv().write(
            file,
            response.map((row: DatabaseRow) => Hydrator(dto, row))
          );
        }
        page++;
        response = await respository.execute(sql, page, limit);
        let updateProgress: any = page * limit;
        let difUpdateProgress = countResponse - page * limit;
        if (difUpdateProgress < limit) {
          if (
            !process.env.COMMAND_LINE ||
            process.env.COMMAND_LINE === "false"
          ) {
            updateProgress = parseFloat(countResponse);
            barProgress.update(updateProgress, {
              event: "DONE",
              count: `${updateProgress}/${countResponse}`,
            });
          }
        }
        if (!process.env.COMMAND_LINE || process.env.COMMAND_LINE === "false") {
          barProgress.increment();
          barProgress.update(updateProgress, {
            count: `${updateProgress}/${countResponse}`,
          });
        }
      }
    }
    if (config.legacy) {
      const newFile = entity.file.split(/\.(?=[^\.]+$)/);
      const files = fs
        .readdirSync(`${process.cwd()}/output/`)
        .filter((file) => {
          if (file.includes(newFile[0])) {
            return true;
          }
        });

      for (const newFiles of files) {
        if (fs.existsSync(`${process.cwd()}/output/${newFiles}`)) {
          await ftpTransport(`${process.cwd()}/output/${newFiles}`, newFiles);
        }
      }
    }
    if (!process.env.COMMAND_LINE || process.env.COMMAND_LINE === "false") {
      ProgressBar.close();
    }
  }
};
consumer.setConfig = (c: Config) => (config = c);

export default consumer;
