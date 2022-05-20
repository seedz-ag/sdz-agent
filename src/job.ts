import { Logger } from "sdz-agent-common";
import OpenIdClient from "./open-id";
import { scheduleJob } from "node-schedule";
import ws from "./websocket/client";
import { Config } from "sdz-agent-types";
import callstack from "./callstack";


const job = async () => {
  if (!ws.isConnected()) {
    OpenIdClient.addSubscriber(ws.setToken.bind(ws));
    await OpenIdClient.connect();
    await OpenIdClient.grant();
    await ws.connect();
  }
  if (!ws.isConnected()) {
    Logger.error("SDZ-AGENT-WS DISCONNECTED, ABORTING.");
    return false;
  }

  const config: Config | Config[] | undefined = await ws.getConfig();
  const configs = Array.isArray(config) ? config : [config];
  for (const c of configs) {
    const schedule = {
      ...{
        minute: "*",
        hour: "*",
        dayOfWeek: "*",
        dayOfMonth: "*",
        month: "*",
      },
      ...c.schedule,
    };
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
            resolve(await callstack(c.name));
          } catch (e) {
            resolve(false);
          }
        });
      }
    );
  }
};

process.on("message", (message: string) => {
  if ("START_JOB" === message) {
    Logger.info("STARTING SCHEDULER.");
    job();
  }
});
