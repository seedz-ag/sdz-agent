import { watch } from "chokidar";
import config from "../config";
import Scheduler from "./job";

const watcher = watch(["../config.json", "../config/dto/**"]);

watcher.on("all", () => {
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

  Scheduler.reschedule(`${schedule.minute} ${schedule.hour} ${schedule.dayOfMonth} ${schedule.month} ${schedule.dayOfWeek}`);
});
