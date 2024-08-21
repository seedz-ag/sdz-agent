import { config } from "dotenv";
import { scheduleJob } from "node-schedule";
import { getContainer } from "./container";
import { ExecuteCommand } from "./commands/execute.command";
import { LoggerAdapter } from "./adapters/logger.adapter";

config();

process.on("message", async (buffer: Buffer) => {
  const container = await getContainer();
  const executeCommand = container.resolve(ExecuteCommand);
  const loggerAdapter = container.resolve(LoggerAdapter);
  const schedules = JSON.parse(buffer.toString());
  loggerAdapter.log(`info`, `SCHEDULING JOBS ${schedules}`);

  for (const schedule of schedules) {
    loggerAdapter.log(`info`, `SCHEDULING JOB AT ${schedule.CronExpression}`);
    scheduleJob(schedule.CronExpression, async () => {
      try {
        return await executeCommand.execute();
      } catch (e) {
        return false;
      }
    });
  }
});
