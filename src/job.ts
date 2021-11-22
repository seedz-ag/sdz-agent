import { ChildProcess, fork } from "child_process";
import { scheduleJob } from "node-schedule";
import { Logger } from "sdz-agent-common";
import extractScheduleConfig from "./utils/extract-schedule-config";
import axios from "axios";
let child: ChildProcess;

const job = async () => {
  const schedule = extractScheduleConfig();
  scheduleJob(
    `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} ${schedule.month} ${schedule.dayOfWeek}`,
    async () => {
      await axios.get("http://localhost:3000/callstack");
    }
  );
};

process.on("message", async (message: string) => {
  if ("START_JOB" === message) {
    Logger.info("STARTING SCHEDULER.");
    await job();
  }
});
