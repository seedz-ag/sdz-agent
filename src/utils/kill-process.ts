import { exec } from "child_process";
import { promisify } from "util";

const cmd = promisify(exec);

export default async (exitCode = 1): Promise<void> => {
  process.exit(exitCode);
};
