import { Config } from "sdz-agent-types";
import yargs from "yargs";
import bootstrap from "../callstack";

export default async (config: Config | Config[], args: string): Promise<boolean> => {
  let configName = 'default'
  if (args) {

    args.split("--").forEach(arg => {    
      const needle = arg.split('=')[0];
      const index = process.argv.findIndex(arg => arg.includes(needle))
      if(index === -1) {
        process.argv.push(`--${arg}`.trim());
      } else {
        process.argv[index] = arg != '' ? `--${arg}`.trim() : '';
      }
    });

    const argv: {[key: string]: any} = yargs(process.argv).argv;

    configName = argv.config ? argv.config : configName;
  }

  return new Promise(async (resolve) => {
    try {
      resolve(await bootstrap(configName));
    }
    catch (e) {
      resolve(false)
    }

  });
};
