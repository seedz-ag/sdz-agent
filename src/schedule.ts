import { watch } from "chokidar";
import { Logger } from "sdz-agent-common";

import call from "./utils/call";

const job = "./src/job";
// const watcher = watch(["./config/**", "./docker/**"], {
//   ignoreInitial: false,
// });

let child = call(job);
child.send("START_JOB");

// watcher.on("change", () => {
//   Logger.info("CLOSING THE SCHEDULER.");
//   child.kill();
//   child = call(job);
//   child.send("START_JOB");
// });
