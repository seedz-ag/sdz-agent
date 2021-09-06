import fs from "fs";

import { Config } from "sdz-agent-types";

const load = (file: string): Config => {
  const buffer = fs.readFileSync(`./config/${file}.json`).toString();
  const json: Config = JSON.parse(buffer);
  return json;
};

const config = load(`../config`);

export default config;
