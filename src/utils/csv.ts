import CSV from "sdz-agent-data";
import { Config } from "sdz-agent-types";

let config: Config;
let instance: CSV;

const csv = () => {
  if (!instance) {
    instance = new CSV(config.legacy, config.fileSize);
  }
  return instance;
}

csv.setConfig = (c: Config) => config = c;

export default csv;