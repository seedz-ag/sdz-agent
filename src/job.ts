import { ChildProcess, fork } from "child_process";
import { scheduleJob } from "node-schedule";

import config from "../config";

let child: ChildProcess;

const schedule = {
  ...{
    minute: "*",
    hour: "*",
    dayOfWeek: "*",
    dayOfMonth: "*",
    month: "*",
  },
  ...(config.schedule || {}),
};

const job = scheduleJob(
  `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} ${schedule.month} ${schedule.dayOfWeek}`,
  () => {
    if (child) {
      child.kill();
    }
    child = fork("./src/bootstrap.ts", [], {
      execArgv: ["-r", "ts-node/register"],
    });
  }
);

export default job;
