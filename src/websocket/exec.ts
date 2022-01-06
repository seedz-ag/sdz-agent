import { exec } from "child_process";

export default async (command: string, cb: any): Promise<boolean> => {
  return new Promise(async (resolve) => {
    await exec(command, (error, stdout, stderr) => {
      if (error) {
        cb(stderr);
        return;
      }
      cb(stdout);
    });
    resolve(true);
  });
};
