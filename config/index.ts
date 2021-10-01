import fs from "fs";

import { Config } from "sdz-agent-types";

const load = (file: string): Partial<Config> => {
  let json: Partial<Config> = {};
  try {
    const buffer = fs.readFileSync(`./config/${file}.json`);
    json = JSON.parse(buffer.toString());
  } catch {}
  return json;
};

const config = load(`../config`) as Config;

export default config;
