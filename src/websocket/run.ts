
import bootstrap from "../callstack";
import { Config } from "sdz-agent-types";

export default async (config: Config, args: string): Promise<boolean> => {
  if (args) {
    process.argv.push(args)
  }
  return new Promise(async (resolve) => {
    try {
      resolve(await bootstrap(config));
    }
    catch (e) {
      resolve(false)
    }

  });
};
