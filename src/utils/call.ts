import { fork } from "child_process";

export default (job: string) =>
  fork(job, process.argv, {
    execArgv: ["-r", "ts-node/register"],
  });
