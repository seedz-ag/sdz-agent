import { exec } from "child_process";

export default async (args: string, cb: any): Promise<boolean> => {
  return new Promise(async (resolve) => {
    await exec(`./bin/run ${args || ''}`, (error, stdout, stderr) => {
      if (error) {
        cb(stderr);
        return;
      }
      cb(stdout);
    });
    resolve(true);
  });
};
