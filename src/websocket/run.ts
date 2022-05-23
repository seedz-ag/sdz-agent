import { Config } from "sdz-agent-types";
import bootstrap from "../callstack";

export default async (config: Config | Config[], args: string, configName = 'default'): Promise<boolean> => {
  if (args) {
    process.argv.push(args)
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
