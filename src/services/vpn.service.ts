import { ChildProcess, exec } from "child_process";
import { createWriteStream, existsSync, rmSync } from "fs";
import { singleton } from "tsyringe";
import { LoggerAdapter } from "../adapters/logger.adapter";
import { ISecurity } from "../interfaces/setting.interface";

@singleton()
export class VPNService {
  private connected = false;

  private files: string[] = [];

  private process?: ChildProcess;

  private security: ISecurity;

  constructor(private readonly loggerAdapter: LoggerAdapter) {}

  private clearFiles(files: string[]) {
    files.forEach((file) => {
      if (existsSync(file)) {
        rmSync(file);
      }
    });
  }

  public configure(security: ISecurity): this {
    this.security = security;
    return this;
  }

  public async connect() {
    this.files.push(`config.ovpn`);

    const configStream = createWriteStream(this.files[0], { mode: 0o600 });
    configStream.write(this.security.Config);
    configStream.end();

    if (this.security.Credentials) {
      const userPassStream = createWriteStream("user-pass.txt", {
        mode: 0o600,
      });
      userPassStream.write(
        `${this.security.Credentials.Username}\n${this.security.Credentials.Password}`
      );
      userPassStream.end();
      this.files.push("user-pass.txt");
    }

    this.process = exec(`sudo -- sh -c "openvpn ${this.files[0]}"`, {
      timeout: 60_000 * 60,
    });

    const connection = new Promise<void>((resolve) => {
      this.process?.stdout?.on("data", (data) => {
        this.loggerAdapter.log("info", data.toString());

        if (data.includes("Initialization Sequence Completed")) {
          this.connected = true;
          resolve();
        }

        if (data.includes("SIGTERM")) {
          this.connected = false;
        }
      });
    });

    const timeout = new Promise((resolve) =>
      setTimeout(async () => {
        if (!this.isConnected()) {
          await this.disconnect();
          throw new Error("VPN CONNECTION TIMEOUT");
        }
      }, 10_000)
    );

    await Promise.race([connection, timeout]);

    this.clearFiles(this.files);
  }

  public async disconnect() {
    exec(`sudo killall openvpn`);

    while (this.connected) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    this.clearFiles(this.files);
  }

  public isConnected() {
    return this.connected;
  }

  public getProcess() {
    return this.process;
  }
}
