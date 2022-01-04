import { exec } from "child_process";

export default async (cb: any): Promise<boolean> => {
  return new Promise(async (resolve) => {
    await exec("git pull", (error, stdout, stderr) => {
      if (error) {
        cb(stderr);
        return;
      }
      cb(stdout);
    });
    resolve(true);
  });
};
