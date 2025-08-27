import { Writable } from "node:stream";
import SFTPClient, { FileInfo } from "ssh2-sftp-client";
import { singleton } from "tsyringe";
import { LoggerAdapter } from "./logger.adapter";

export type FTPAdapterConfig = {
  host: string;
  password: string;
  port?: number;
  username: string;
};

@singleton()
export class FTPAdapter {
  private readonly client: SFTPClient;

  private config: FTPAdapterConfig;

  constructor(private readonly loggerAdapter: LoggerAdapter) {
    this.client = new SFTPClient();
  }

  public setConfig(config: FTPAdapterConfig) {
    this.config = config;
  }

  async connect() {
    try {
      await this.client
        .connect({ ...this.config, timeout: 5000 })
        .then(() => {
          this.client.end();
          return true;
        })
        .catch((e: any) => {
          throw e;
        });
      return true;
    } catch (e) {
      this.loggerAdapter.log("error", "INVALID FTP CONFIGURATION.");
      throw e;
    }
  }

  async sendFile(
    localFileName: string,
    remoteFileName: string
  ): Promise<boolean> {
    let complete = false;
    try {
      await this.client
        .fastPut(localFileName, remoteFileName, {
          step: function (total_transferred: any, chunk: any, total: any) {},
        })
        .then(() => {
          this.client.end();
        });
      complete = true;
    } catch (e) {
      this.loggerAdapter.log(
        "error",
        `ERROR SENDING ${remoteFileName} TO FTP.`
      );
      throw e;
    }
    return complete;
  }

  async getFile(remoteFileName: string, stream: Writable): Promise<boolean> {
    let complete = false;
    try {
      await this.client.get(remoteFileName, stream).then(() => {
        this.client.end();
      });
      complete = true;
    } catch (e) {
      this.loggerAdapter.log(
        "error",
        `ERROR DOWNLOADING ${remoteFileName} FROM FTP.`
      );
      throw e;
    }
    return complete;
  }

  async renameFile(
    remoteFileName: string,
    newRemoteFileName: string
  ): Promise<boolean> {
    let complete = false;
    try {
      await this.client
        .rename(remoteFileName, newRemoteFileName)
        .then(() => {
          this.client.end();
        })
        .catch((err: TypeError) => {
          throw err;
        });
      complete = true;
    } catch (e) {
      this.loggerAdapter.log(
        "error",
        `ERROR RENAMING ${remoteFileName} AT FTP.`
      );
      throw e;
    }
    return complete;
  }

  async list(path: string): Promise<FileInfo[]> {
    try {
      console.log({path});
      return await this.client.list(path);
    } catch (e) {
      this.loggerAdapter.log("error", `ERROR LISTING ${path} AT FTP.`);
      throw e;
    }
  }
}
