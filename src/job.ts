import { fork } from "child_process";
import { scheduleJob } from "node-schedule";

import config from "../config";

const file = "./bootstrap";

let child = fork(file);
child.kill();

const schedule = config.schedule || {
  minute: "0",
  hour: "0",
  dayOfWeek: "*",
};

const job = scheduleJob(schedule, () => {
  child = fork(file);
});

export default job;
