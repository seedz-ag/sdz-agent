import { Config, Entity, HydratorMapping } from "sdz-agent-types";

import HttpConsumer from "../../http/client";
import { Hydrator } from "sdz-agent-common";
import csv from "../csv";
import fs from "fs";
import ftpTransport from "../transports/ftp";
import httpTransport from "../transports/http";
import ws from "../../websocket/client";

let config: Config;

const http = new HttpConsumer();

const consume = async (entity: Entity, dto: HydratorMapping, request: Record<string, any>): Promise<boolean> => {
    http.setBody(request.body);
    http.setDataPath(request.dataPath);
    http.setHeaders(request.headers);
    http.setMethod(request.method);
    http.setScope(request.scope);
    http.setURL(request.url);
    http.setInsecure(request.insecure);
    const response = await http.request();

    const data = (Array.isArray(response) ? response : [response]).map(
      (row: any) => Hydrator(dto, row)
    );

    if (!config.legacy) {
      await httpTransport(entity.entity, data);
      return false;
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

    if (request.paginates && data.length > 0) {
      return true;
    }

    return false;
}

let cont;

const consumer = async () => {
  const entities: Entity[] = config.scope;
  for (const entity of entities) {
    const dto = (config?.dtos?.[entity.name.toLocaleLowerCase()] ||
      (await ws.getDTO(entity.name.toLocaleLowerCase()))) as HydratorMapping;
    const request: any =
      config?.http?.[entity.name.toLocaleLowerCase()] ||
      (await ws.getHttpRequest(entity.name.toLocaleLowerCase()));

    fs.writeFileSync(
      `${process.cwd()}/output/${entity.name.toLocaleLowerCase()}.json`,
      JSON.stringify(request)
    );

    cont = await consume(entity, dto, request)
    while (cont) {
      cont = await consume(entity, dto, request)
    }
  }
};

consumer.setConfig = (c: Config) => (config = c);

export default consumer;
