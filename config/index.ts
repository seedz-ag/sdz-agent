import fs from "fs";

import { Config } from "sdz-agent-types";

const load = (file: string): Partial<Config> => {
  let json: Partial<Config> = {};
  try {
    const dir = process.env.DOCKER ? `/opt/sdz-agent/docker` : `/opt/sdz-agent/config`;
    const buffer = fs.readFileSync(`${dir}/${file}.json`);
    json = JSON.parse(buffer.toString());
  } catch {}
  return json;
};

const config = load(`config`) as Config;

export default config;
