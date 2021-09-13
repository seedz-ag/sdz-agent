import { watch } from "chokidar";
import config from "../config";
import Scheduler from "./job";

const watcher = watch("../config", {
  ignoreInitial: true,
});

watcher.on("all", () => {
  const schedule = config.schedule || {
    minute: "0",
    hour: "0",
    dayOfWeek: "*",
  };

  Scheduler.reschedule(schedule);
});
