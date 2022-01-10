import yargs, { Argv } from "yargs";
import { hideBin } from "yargs/helpers";

const { argv } = yargs(hideBin(process.argv))
  .command("config", "Runs interactive config", (yargs: Argv) => {
    return yargs.positional("C", {
      default: true,
    });
  })
  .command("dto", "Runs interactive DTO config", (yargs: Argv) => {
    return yargs.positional("D", {
      default: true,
    });
  })
  .command("query [sql]", "Executes the given query", (yargs: Argv) => {
    return yargs.positional("sql", {
      default: "",
    });
  })
  .command("scheduler", "Runs the scheduler", (yargs: Argv) => {
    return yargs.positional("S", {
      default: true,
    });
  })
  .command(
    "superacao [types]",
    "Runs the Superacao integration",
    (yargs: Argv) => {
      return yargs.positional("types", {
        choices: ["all", "lynx", "protheus"],
        default: "all",
      })
      .positional("superacao", {
        default: true
      });
    }
  )
  .command("update", "Updates the agent", (yargs: Argv) => {
    return yargs.positional("U", {
      default: true,
    });
  })
  .epilog("for more information visit https://github.com/seedz-ag/sdz-agent")
  .showHelpOnFail(false, "whoops, something went wrong! run with --help")
  .options({
    config: {
      alias: "C",
      description: "Runs interactive config",
      requiresArg: false,
      required: false,
    },
    configDto: {
      alias: "D",
      description: "Runs interactive DTO config",
      requiresArg: false,
      required: false,
    },
    query: {
      alias: "Q",
      description: "Executes the given query",
      requiresArg: true,
      required: false,
    },
    schedule: {
      alias: "S",
      description: "Runs the scheduler",
      requiresArg: false,
      required: false,
    },
    update: {
      alias: "U",
      description: "Updates the agent",
      requiresArg: false,
      required: false,
    },
  })
  .usage("This is the SdzAgent command line program\n\nUsage: $0 [options]")
  .version("version", "1.0.0")
  .alias("version", "V");

export default argv;
