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
  private isConnected: boolean = false;
  
  constructor(private readonly loggerAdapter: LoggerAdapter) {
    this.client = new SFTPClient();

    this.client.on("end", () => {
      this.loggerAdapter.log("warn", "SFTP connection ended.");
      this.isConnected = false;
    });

    this.client.on("close", () => {
      this.loggerAdapter.log("warn", "SFTP connection closed.");
      this.isConnected = false;
    });

    this.client.on("error", (err) => {
      console.log({err});
      this.loggerAdapter.log("error", `SFTP error: ${err.message}`);
      this.isConnected = false;
    });
  }

  public setConfig(config: FTPAdapterConfig) {
    this.config = config;
  }

  async connect() {
    try {
      if (this.isConnected) {
        return true;
      }
      await this.client.connect({
        ...this.config,
        timeout: 20000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 6,
      } as any);
      this.isConnected = true;
      return true;
    } catch (e) {
      this.loggerAdapter.log("error", "INVALID FTP CONFIGURATION.");
      this.isConnected = false;
      throw e;
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.client.end();
      this.isConnected = false;
    }
  }

  async sendFile(
    localFileName: string,
    remoteFileName: string
  ): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      await this.client.fastPut(localFileName, remoteFileName, {
        step: function (total_transferred: any, chunk: any, total: any) {},
      });
      
      return true;
    } catch (e) {
      this.loggerAdapter.log(
        "error",
        `ERROR SENDING ${remoteFileName} TO FTP.`
      );
      throw e;
    }
  }

  async getFile(remoteFileName: string, stream: Writable): Promise<boolean> {
    const attemptDownload = async () => {
      if (!this.isConnected) {
        await this.connect();
      }
      this.loggerAdapter.log(
        "info",
        `DOWNLOADING ${remoteFileName} FROM FTP.`
      );
      await this.client.get(remoteFileName, stream);
    };
    try {
      await attemptDownload();
      return true;
    } catch (e: any) {
      const message = e?.message || String(e);
      if (message && message.includes("ECONNRESET")) {
        this.loggerAdapter.log("warn", "ECONNRESET detected. Reconnecting and retrying download.");
        try { await this.disconnect(); } catch {}
        await this.connect();
        await attemptDownload();
        return true;
      }
      this.loggerAdapter.log(
        "error",
        `ERROR DOWNLOADING ${remoteFileName} FROM FTP.`
      );
      throw e;
    }
  }

  async renameFile(
    remoteFileName: string,
    newRemoteFileName: string
  ): Promise<boolean> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      await this.client.rename(remoteFileName, newRemoteFileName);
      return true;
    } catch (e) {
      this.loggerAdapter.log(
        "error",
        `ERROR RENAMING ${remoteFileName} AT FTP.`
      );
      throw e;
    }
  }

  async list(path: string, extension?: string): Promise<FileInfo[]> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }
      
      let list: FileInfo[];
      try {
        list = await this.client.list(path);
      } catch (e: any) {
        const message = e?.message || String(e);
        if (message && message.includes("ECONNRESET")) {
          this.loggerAdapter.log("warn", "ECONNRESET on list. Reconnecting and retrying.");
          try { await this.disconnect(); } catch {}
          await this.connect();
          list = await this.client.list(path);
        } else {
          throw e;
        }
      }
      if (!extension) {
        return list;
      }

      const normalizedExtension = extension.startsWith(".")
        ? extension.toLowerCase()
        : `.${extension.toLowerCase()}`;

      return list.filter((entry) => {
        const name = (entry as any).name as string | undefined;
        if (!name) return false;
        return name.toLowerCase().endsWith(normalizedExtension);
      });
    } catch (e) {
      console.log({e});
      this.loggerAdapter.log("error", `ERROR LISTING ${path} AT FTP.`);
      throw e;
    }
  }
}
