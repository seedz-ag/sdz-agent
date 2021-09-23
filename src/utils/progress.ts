import chalk from "chalk";
import cliProgress from "cli-progress";

export default new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
    format: chalk.green("{bar}") + "| {percentage}% || {value}/{total}",
  },
  cliProgress.Presets.shades_grey
);
