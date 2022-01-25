import { exec } from "child_process";

export default async (): Promise<string> => {
  return new Promise(async (resolve) => {
    await exec("git pull", (error, stdout, stderr) => {
      resolve((error && stderr) || stdout);
    });
  });
};
