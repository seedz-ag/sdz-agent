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
  
  private async sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  
  private isConnReset(err: any): boolean {
    const message = err?.message || String(err);
    return (
      err?.code === "ECONNRESET" ||
      message.includes("ECONNRESET") ||
      err?.syscall === "read"
    );
  }
  
  private formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value = value / 1024;
      unitIndex++;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }
  
  private async getRemoteFileSize(remoteFileName: string): Promise<number | null> {
    const maxAttempts = 3;
    let lastError: any = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!this.isConnected) {
          await this.connect();
        }
        const stats = await this.client.stat(remoteFileName);
        const size = (stats as any)?.size as number | undefined;
        return typeof size === "number" ? size : null;
      } catch (e: any) {
        lastError = e;
        if (this.isConnReset(e) && attempt < maxAttempts) {
          const backoff = 300 * Math.pow(2, attempt - 1);
          this.loggerAdapter.log(
            "warn",
            `ECONNRESET on stat. Reconnecting and retrying in ${backoff}ms (attempt ${attempt + 1}/${maxAttempts}).`
          );
          try { await this.disconnect(); } catch {}
          await this.sleep(backoff);
          await this.connect();
          continue;
        }
        break;
      }
    }
    this.loggerAdapter.log("warn", `Could not determine remote file size for ${remoteFileName}. Error: ${lastError?.message || lastError}`);
    return null;
  }
  
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
        // Larger timeouts and keepalive for bigger files like CSV
        readyTimeout: 60000,
        timeout: 60000,
        keepaliveInterval: 10000,
        keepaliveCountMax: 9,
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
    const maxAttempts = 3;
    const size = await this.getRemoteFileSize(remoteFileName);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (!this.isConnected) {
          await this.connect();
        }
        this.loggerAdapter.log(
          "info",
          `DOWNLOADING ${remoteFileName} FROM FTP${size !== null ? ` (size: ${this.formatBytes(size)} - ${size} bytes)` : ""}. Attempt ${attempt}/${maxAttempts}`
        );
        const startedAt = Date.now();
        await this.client.get(remoteFileName, stream);
        const elapsedMs = Date.now() - startedAt;
        const speedMsg = size !== null && elapsedMs > 0
          ? `, avg speed: ${this.formatBytes((size * 1000) / elapsedMs)}/s`
          : "";
        this.loggerAdapter.log(
          "info",
          `DOWNLOADED ${remoteFileName} in ${elapsedMs} ms${speedMsg}`
        );
        return true;
      } catch (e: any) {
        if (this.isConnReset(e) && attempt < maxAttempts) {
          const backoff = 500 * Math.pow(2, attempt - 1);
          this.loggerAdapter.log(
            "warn",
            `ECONNRESET on getFile. Reconnecting and retrying in ${backoff}ms (attempt ${attempt + 1}/${maxAttempts}).`
          );
          try { await this.disconnect(); } catch {}
          await this.sleep(backoff);
          await this.connect();
          continue;
        }
        this.loggerAdapter.log(
          "error",
          `ERROR DOWNLOADING ${remoteFileName} FROM FTP.`
        );
        throw e;
      }
    }
    return false;
  }

  async getFileBuffer(remoteFileName: string): Promise<Buffer> {
    const maxAttempts = 3;
    const expectedSize = await this.getRemoteFileSize(remoteFileName);
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let data: Buffer = Buffer.from("");
      const stream = new Writable({
        write(chunk, _encoding, callback) {
          data = Buffer.concat([data, chunk]);
          callback();
        }
      });
      try {
        if (!this.isConnected) {
          await this.connect();
        }
        const startedAt = Date.now();
        this.loggerAdapter.log(
          "info",
          `DOWNLOADING (buffer) ${remoteFileName} FROM FTP${expectedSize !== null ? ` (size: ${this.formatBytes(expectedSize)} - ${expectedSize} bytes)` : ""}. Attempt ${attempt}/${maxAttempts}`
        );
        await this.client.get(remoteFileName, stream);
        const elapsedMs = Date.now() - startedAt;
        const size = data.length;
        const speedMsg = elapsedMs > 0 ? `, avg speed: ${this.formatBytes((size * 1000) / elapsedMs)}/s` : "";
        this.loggerAdapter.log(
          "info",
          `DOWNLOADED (buffer) ${remoteFileName} in ${elapsedMs} ms (received: ${this.formatBytes(size)} - ${size} bytes)${speedMsg}`
        );
        if (expectedSize !== null && size !== expectedSize) {
          this.loggerAdapter.log(
            "warn",
            `Downloaded size (${size}) differs from expected (${expectedSize}).${attempt < maxAttempts ? " Retrying." : ""}`
          );
          if (attempt < maxAttempts) {
            try { await this.disconnect(); } catch {}
            await this.sleep(300 * Math.pow(2, attempt - 1));
            await this.connect();
            continue;
          }
        }
        return data;
      } catch (e: any) {
        if (this.isConnReset(e) && attempt < maxAttempts) {
          const backoff = 500 * Math.pow(2, attempt - 1);
          this.loggerAdapter.log(
            "warn",
            `ECONNRESET on getFileBuffer. Reconnecting and retrying in ${backoff}ms (attempt ${attempt + 1}/${maxAttempts}).`
          );
          try { await this.disconnect(); } catch {}
          await this.sleep(backoff);
          await this.connect();
          continue;
        }
        this.loggerAdapter.log(
          "error",
          `ERROR DOWNLOADING (buffer) ${remoteFileName} FROM FTP.`
        );
        throw e;
      }
    }
    throw new Error("Failed to download file buffer");
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
      
      let list: FileInfo[] = [];
      const maxAttempts = 3;
      let lastError: any = null;
      let succeeded = false;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          list = await this.client.list(path);
          succeeded = true;
          break;
        } catch (e: any) {
          lastError = e;
          if (this.isConnReset(e) && attempt < maxAttempts) {
            const backoff = 500 * Math.pow(2, attempt - 1);
            this.loggerAdapter.log(
              "warn",
              `ECONNRESET on list. Reconnecting and retrying in ${backoff}ms (attempt ${attempt + 1}/${maxAttempts}).`
            );
            try { await this.disconnect(); } catch {}
            await this.sleep(backoff);
            await this.connect();
            continue;
          }
          throw e;
        }
      }
      if (!succeeded) {
        throw lastError || new Error("Failed to list path");
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
