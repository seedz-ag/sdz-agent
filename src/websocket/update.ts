import { exec } from "child_process";

export default async (cb: any): Promise<void> => {
  exec("git pull", (error, stdout, stderr) => {
    if (error) {
      cb(stderr);
      return;
    }
    cb(stdout);
  });
};
