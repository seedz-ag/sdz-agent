import cliProgress, { SingleBar } from "cli-progress";

class ProgressBar {
  private progress;
  private list: Partial<{ [key: string]: SingleBar }> = {};
  constructor() {
    this.progress = new cliProgress.MultiBar(
      {
        clearOnComplete: false,
        stopOnComplete: true,
        hideCursor: true,
        format: `[{color}{bar}\u001b[0m] | {event} {text} || {percentage}% || {value}/{total} Records `,
      },

      cliProgress.Presets.shades_grey
    );
  }

  create(n: any, total: any, init: any, options: any) {
    const instenceProgress = this.progress.create(total, init, options);
    this.list[n] = instenceProgress;
    return instenceProgress;
  }

  get(n: any) {
    return this.list[n];
  }

  update(n: string, total: any, options: any) {
    const index = n as keyof this.list
    this.list[n].update(total, options);
  }
}

export default new ProgressBar();
