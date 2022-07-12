import { exec } from "child_process";
import { promisify } from "util";

const cmd = promisify(exec);

export default async (): Promise<void> => {
  if (["win32"].includes(process.platform)) {
    if (await cmd("net start | find 'SDZ-AGENT'")) {
      await cmd("net stop SDZ-AGENT");
      await cmd("net start SDZ-AGENT");
    }
  }
  process.exit(1);
};
