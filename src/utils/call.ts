import { fork } from "child_process";

export default (job: string) =>
  fork(job, [], {
    execArgv: ["-r", "ts-node/register"],
  });
