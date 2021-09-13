import { watch } from "chokidar";
import { Logger } from "sdz-agent-common";
import config from "../config";
import Scheduler from "./job";

const watcher = watch(["../config.json", "../config/dto/**"]);

watcher.on("all", () => {
  Logger.info("AGENDAMENTO");

  Scheduler.cancel();

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
  console.log(schedule);
  Scheduler.reschedule(
    `${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} ${schedule.month} ${schedule.dayOfWeek}`
  );
});
