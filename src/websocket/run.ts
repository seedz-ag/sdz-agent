import { exec } from "child_process";

export default async (...args: string[]): Promise<string> => {
  return new Promise(async (resolve) => {
    await exec(`./bin/run --isWS ${args && args.join(' ') || ""}`, (error, stdout, stderr) => {
      resolve((error && stderr) || stdout);
    });
  });
};
