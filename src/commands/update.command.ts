// import { singleton } from "tsyringe";
import { exec } from "child_process";
import { ICommand } from "../interfaces/command.interface";
import { LoggerAdapter } from "../adapters/logger.adapter";

// @singleton()
export class UpdateCommand implements ICommand {
  constructor(private readonly loggerAdapter: LoggerAdapter) {}

  public createBackUpBranch() {
    return new Promise<void>((resolve) => {
      resolve();
    })
  }

  public gitGetCurrentBranch() {
    return new Promise<string>((resolve) => {
      const child = exec("git rev-parse --abbrev-ref HEAD");

      if (!child.stdout || !child.stderr) {
        return;
      }

      let branch: string;

      child.stdout.on("data", (data) => {
        branch = data.trim();
      });

      child.stdout.on("end", () => {
        resolve(branch);
      });
    });
  }

  public gitCheckout(branch: string = "main") {
    return new Promise<void>((resolve, reject) => {
      const child = exec(`git checkout ${branch}`);

      if (!child.stdout || !child.stderr) {
        return;
      }

      child.stdout.on("end", () => {
        this.loggerAdapter.log(
          "warn",
          "Git Update - Succesfuly checked out main"
        );

        resolve();
      });
    });
  }

  public gitPull() {
    return new Promise((resolve, reject) => {
      const child = exec("git pull");

      if (!child.stdout || !child.stderr) {
        return;
      }

      child.stdout.on("end", resolve);

      child.stderr.on("data", (data) => {
        this.loggerAdapter.log(
          "error",
          "Git Update - Error pulling repository"
        );

        this.loggerAdapter.log("error", "Git Update - " + data);

        reject();
      });
    });
  }

  public installDependencies() {
    return new Promise((resolve, reject) => {
      this.loggerAdapter.log(
        "info",
        "Git Update - Installing application dependencies"
      );

      const child = exec(`npm i -f`);

      if (!child.stdout || !child.stderr) {
        return;
      }

      child.stdout.on("end", resolve);

      child.stdout.on("data", (data) =>
        this.loggerAdapter.log(
          "info",
          "Git Update - npm install: " + data.replace(/\r?\n|\r/g, "")
        )
      );

      child.stderr.on("data", (data) => {
        if (data.toLowerCase().includes("error")) {
          data = data.replace(/\r?\n|\r/g, "");

          this.loggerAdapter.log(
            "error",
            "Git Update - Error installing dependencies"
          );

          this.loggerAdapter.log("error", "Git Update - " + data);
          reject();
        } else {
          this.loggerAdapter.log("warn", "Git Update - " + data);
        }
      });
    });
  }

  public restoreBackUpBranch() {
    return new Promise<void>((resolve) => {
      resolve();
    })
  }

  public async execute() {
    try {
      await this.createBackUpBranch();

      const branch = await this.gitGetCurrentBranch();

      if ("main" !== branch) {
        await this.gitCheckout();
      }

      await this.gitPull();

      await this.installDependencies();
    } catch (e) {
      await this.restoreBackUpBranch();
    }
  }
}
