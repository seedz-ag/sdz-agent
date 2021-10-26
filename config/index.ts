import fs from "fs";
import { createSQLHosts } from '../src/config/database/informix'
import { Config } from "sdz-agent-types";

const load = (file: string): Partial<Config> => {
  let json: Partial<Config> = {};

  try {
    const dir = process.env.DOCKER ? `/docker/config` : `/config`;
    const buffer = fs.readFileSync(`${process.cwd()}${dir}.json`);

    json = JSON.parse(buffer.toString());

    'informix' === json.database?.driver && createSQLHosts(json.database)

  } catch {}
  return json;
};

const config = load(`../config`) as Config;

export default config;
