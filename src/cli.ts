import "reflect-metadata";
import colors from "colors";
import { binary, clock, dots, earth } from "cli-spinners";
import ora, { Ora } from "ora";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

import { getContainer } from "./container";
import { APILoggerAdapter } from "./adapters/api-logger.adapter";
import { ConsoleLoggerAdapter } from "./adapters/console-logger.adapter";
import { LoggerAdapter } from "./adapters/logger.adapter";
import { CheckCommand } from "./commands/check.command";
import { ConfigureCommand } from "./commands/configure.command";
import { ExecuteCommand } from "./commands/execute.command";
import { SchedulerCommand } from "./commands/scheduler.command";
import { UpdateCommand } from "./commands/update.command";
import { ListenCommand } from "./commands/listen.command";
import { EnvironmentService } from "./services/environment.service";
import { UtilsService } from "./services/utils.service";
import { LogsService } from "./services/logs.service";

process.env.CLI = "1";

(async () => {
  const container = await getContainer();
  const utilsService = container.resolve(UtilsService);

  const loggerAdapter = container.resolve(LoggerAdapter);
  const logsService = container.resolve(LogsService);
  const apiLoggerAdapter = container.resolve(APILoggerAdapter);

  try {
    loggerAdapter.log("info", "CONSUMING LOG");
    await logsService.consumeOutput();
  } catch (error: any) {
    loggerAdapter.log(
      "error",
      "IMPOSSIBLE TO CONSUME LOG, MAYBE ANOTHER TIME",
      `ERROR: ${error.status}`
    );
  }

  const apiLoggerStream = loggerAdapter.pipe(apiLoggerAdapter);
  apiLoggerStream.on("close", () => apiLoggerAdapter.uncork());

  yargs(hideBin(process.argv))
    .scriptName("")
    .epilog("for more information visit https://github.com/seedz-ag/sdz-agent")
    .showHelpOnFail(true) //, "whoops, something went wrong! run with --help")
    .usage("This is the SDZ Agent CLI\n\nUsage: $0 [options]")
    .version("version", "1.5.0")
    .command(
      "check <type>",
      "Check Agent Connectivity",
      (yargs) =>
        yargs
          .positional("type", {
            choices: ["auth", "datasource", "dns", "speed", "all"],
            type: "string",
          })
          .showHelpOnFail(true),
      async (argv) => {
        const { type } = argv;
        if (!type) {
          return;
        }

        utilsService.mergeEnv(argv);
        const environmentService = container.resolve(EnvironmentService);
        environmentService.parse();

        const checkCommand = container.resolve(CheckCommand);

        const loggerAdapter = container.resolve(LoggerAdapter);

        const spinner = ora({
          text: "RUNNING ",
          spinner: dots,
        });

        spinner.start();

        const response = await checkCommand.execute({ type } as any);

        spinner.stop();

        argv.VERBOSE = "true";

        utilsService.mergeEnv(argv);
        environmentService.parse();

        if ("all" === response.type || "datasource" === response.type) {
          if (response.checkDataSource) {
            loggerAdapter.log(
              "info",
              colors.bold(`    DATASOURCE:`),
              colors.green("SUCCESS")
            );
          } else {
            loggerAdapter.log(
              "info",
              colors.bold(`    DATASOURCE:`),
              colors.red("FAIL")
            );
          }
        }

        if ("all" === response.type || "dns" === response.type) {
          if (response.checkDNS) {
            loggerAdapter.log(
              "info",
              colors.bold(`           DNS:`),
              colors.green("SUCCESS")
            );
          } else {
            loggerAdapter.log(
              "info",
              colors.bold(`           DNS:`),
              colors.red("FAIL")
            );
          }
        }

        if ("all" === response.type || "speed" === response.type) {
          if (response.checkConnectionSpeed) {
            const { download, upload } = response.checkConnectionSpeed;
            loggerAdapter.log(
              "info",
              colors.bold(`INTERNET SPEED:`),
              colors.green(`▼ ${download} mbps`),
              "/",
              colors.green(`▲ ${upload} mbps`)
            );
          } else {
            loggerAdapter.log(
              "info",
              colors.bold(`INTERNET SPEED:`),
              colors.red("NO CONNECTION")
            );
          }
        }

        if ("all" === response.type || "auth" === response.type) {
          if (response.checkAuth) {
            loggerAdapter.log(
              "info",
              colors.bold(`          AUTH:`),
              colors.green("SUCCESS")
            );
          } else {
            loggerAdapter.log(
              "info",
              colors.bold(`          AUTH:`),
              colors.red("FAIL")
            );
          }
        }

        spinner.succeed("DONE");
      }
    )
    .command("configure", "Configures Agent", async (argv) => {
      utilsService.mergeEnv(argv);
      const environmentService = container.resolve(EnvironmentService);
      environmentService.parse();
      const configureCommand = container.resolve(ConfigureCommand);
      await configureCommand.execute();
    })
    .command(
      "run",
      "Executes an extraction",
      (yargs) =>
        yargs
          .option("env", {
            alias: "e",
            describe: "Sends data to specified Environtment",
            type: "string",
          })
          .option("extract-last-n-days", {
            alias: "n",
            describe: "Extracts data from specified period",
            type: "number",
          })
          .option("query", {
            alias: "q",
            describe: "Execute specified Query",
            type: "string",
          })
          .option("raw-only", {
            alias: "r",
            describe: "Sends only raw data",
            type: "boolean",
          })
          .option("schema", {
            alias: "s",
            describe: "Extract only specified Schema",
            type: "string",
          })
          .option("use-console-log", {
            alias: "c",
            describe: "Use Console Log",
            type: "boolean",
          }),
      async (argv) => {
        utilsService.mergeEnv(argv);
        const environmentService = container.resolve(EnvironmentService);
        environmentService.parse();

        let spinner: Ora | undefined;

        if (!environmentService.get("USE_CONSOLE_LOG")) {
          spinner = ora({
            text: "RUNNING ",
            spinner: binary,
          });

          (global as any).spinner = spinner;

          spinner.start();
        } else {
          const consoleLoggerAdapter = container.resolve(ConsoleLoggerAdapter);
          loggerAdapter.pipe(consoleLoggerAdapter);
        }

        const executeCommand = container.resolve(ExecuteCommand);

        try {
          await executeCommand.execute();
          !!spinner && spinner.succeed("DONE");
        } catch (error: any) {
          loggerAdapter.log("error", error?.response?.data || error.message);
          !!spinner && spinner.fail("ERROR");
        } finally {
          loggerAdapter.push(null);
        }
      }
    )
    .command(
      "listen",
      "Puts the Agent in Listening State",
      (yargs) =>
        yargs
          .option("retries", {
            alias: "r",
            default: 1,
            describe: "Number of retries",
            type: "number",
          })
          .option("log-ping", {
            alias: "l",
            describe: "Shows received Ping",
            type: "boolean",
          }),
      async (argv) => {
        utilsService.mergeEnv(argv);
        const environmentService = container.resolve(EnvironmentService);
        environmentService.parse();
        const listenScheduler = container.resolve(ListenCommand);

        const spinner = ora({
          text: "LISTENING ",
          spinner: earth,
        });

        spinner.start();

        (global as any).spinner = spinner;

        utilsService.mergeEnv(argv);

        let retries = Number(argv.retries);

        while (retries > 0) {
          try {
            await listenScheduler.execute();
          } catch (error: any) {
            if ("ECONNABORTED" === error.code) {
              console.log(
                colors.red(
                  "CONNECTION ABORTED, POSSIBLY AN INTERNET CONNECTION PROBLEM, PLEASE RUN AGENT CHECK FOR MORE INFORMATION"
                )
              );
              break;
            }
          } finally {
            retries--;
          }
        }

        spinner.fail("STOPPED");
      }
    )
    .command(
      "scheduler",
      "Executes the scheduler",
      (yargs) =>
        yargs
          .option("listen", {
            alias: "l",
            describe: "Enables listening with scheduler",
            default: true,
            type: "boolean",
          })
          .option("forever", {
            alias: "f",
            describe: "Restarts scheduler on any interruption",
            default: true,
            type: "boolean",
          }),
      async (argv) => {
        utilsService.mergeEnv(argv);
        const environmentService = container.resolve(EnvironmentService);
        environmentService.parse();
        const schedulerCommand = container.resolve(SchedulerCommand);

        const spinner = ora({
          text: "WORKING ",
          spinner: clock,
        });

        spinner.start();

        (global as any).spinner = spinner;

        utilsService.mergeEnv(argv);

        await schedulerCommand.execute();

        spinner.fail("STOPED");
      }
    )
    .command("update", "Updates Agent code", async (argv) => {
      utilsService.mergeEnv(argv);
      const environmentService = container.resolve(EnvironmentService);
      environmentService.parse();
      const updateCommand = container.resolve(UpdateCommand);

      const spinner = ora({
        text: "UPDATING ",
      });

      spinner.start();

      (global as any).spinner = spinner;

      try {
        await updateCommand.execute();
        spinner.succeed("DONE");
      } catch {
        spinner.fail("FAILED");
      }
    })
    .completion("completion", function (current, argv, done) {
      setTimeout(function () {
        done([]);
      }, 500);
    })
    .option("verbose", {
      alias: "v",
      type: "boolean",
    })
    .strictCommands()
    .demandCommand(1)
    .parse();

  await new Promise<void>((resolve, reject) => {
    apiLoggerStream.on("close", () => {
      resolve();
      utilsService.killProcess();
    });
    apiLoggerStream.on("error", () => {
      reject();
      utilsService.killProcess();
    });
  });
})();
