import { ChildProcess, fork } from "child_process";
import { scheduleJob } from "node-schedule";
import { Logger } from "sdz-agent-common";
import extractScheduleConfig from "./utils/extract-schedule-config";

let child: ChildProcess;

const job = () => {
  const schedule = extractScheduleConfig();
  scheduleJob(
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
};

process.on("message", (message: string) => {
  if ("START_JOB" === message) {
    Logger.info("STARTING SCHEDULER.");
    job();
  }
});
