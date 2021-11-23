import { watch } from "chokidar";
import { Logger } from "sdz-agent-common";

import call from "./utils/call";

const entrypoint = "./src/entrypoint";
const job = "./src/job";
const watcher = watch(["./config/**", "./docker/**"], {
  ignoreInitial: false,
});

let child1 = call(entrypoint);
let child2 = call(job);
//child2.send("START_JOB");

watcher.on("change", () => {
  Logger.info("CLOSING THE SCHEDULER.");
  child1.kill();
  child2.kill();
  child1 = call(entrypoint);
  child2 = call(job);
  child2.send("START_JOB");
});
