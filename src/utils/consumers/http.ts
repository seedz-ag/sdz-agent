import { Config, Entity, HydratorMapping } from "sdz-agent-types";

import { Factory } from "sdz-agent-common";
import HttpConsumer from "../../http/client";
import csv from "../csv";
import fs from "fs";
import ftpTransport from "../transports/ftp";
import httpTransport from "../transports/http";
import ws from "../../websocket/client";

let config: Config;

const consumer = async () => {
  const entities: Entity[] = config.scope;
  const http = new HttpConsumer();
  for (const entity of entities) {
    const dto = (config?.dtos?.[entity.name.toLocaleLowerCase()] || await ws.getDTO(entity.name.toLocaleLowerCase())) as HydratorMapping;
    const request: any = config.http[entity.name.toLocaleLowerCase()] || await ws.getHttpRequest(entity.name.toLocaleLowerCase());
    http.setBody(request.body);
    http.setDataPath(request.dataPath);
    http.setHeaders(request.headers);
    http.setScope(request.scope);
    http.setURL(request.url);

    const response = await http.request();

    const data = (Array.isArray(response) ? response : [response]).map((row: any) => Factory(dto, row));

    if (!config.legacy) {
      await httpTransport(entity.entity, data);
      continue;
    }
    await csv().write(`${process.cwd()}/output/${entity.file}`, data);
    const newFile = entity.file.split(/\.(?=[^\.]+$)/);
    const files = fs.readdirSync(`${process.cwd()}/output/`).filter((file) => {
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
};

consumer.setConfig = (c: Config) => (config = c);

export default consumer;
