import bootstrap from "./callstack";
import { ChildProcess, fork } from "child_process";
import { scheduleJob } from "node-schedule";
import { Logger } from "sdz-agent-common";
import extractScheduleConfig from "./utils/extract-schedule-config";


let child: ChildProcess;

const job = async () => {
  const schedule = await extractScheduleConfig();
  scheduleJob(
    `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} ${schedule.month} ${schedule.dayOfWeek}`,
    () => {
      // if (child) {
      //   child.kill();
      // }
      // child = fork("./src/bootstrap.ts", process.argv, {
      //   execArgv: ["-r", "ts-node/register"],
      // });
      return new Promise(async (resolve) => {
        try {
          resolve(await bootstrap());
        }
        catch (e) {
          resolve(false)
        }
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
