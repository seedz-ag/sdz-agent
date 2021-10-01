import fs from "fs";
import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { ConfigAuthFTP } from "sdz-agent-types";

export default class ProcessScopeFTP {
  private csv: CSV;
  private files: string[];
  private ftp: FTP;
  private promises: Promise<boolean>[];
  constructor(config: ConfigAuthFTP, legacy: boolean) {
    this.csv = new CSV(legacy);
    this.ftp = new FTP(config);
    this.ftp.connect();
  }

  process(response: any): void {
    if (!this.files.includes(response.meta.file)) {
      this.files.push(response.meta.file);
    }
    const promise = new Promise<boolean>((resolve): void => {
      this.csv.write(response.meta.file, response.data);
      resolve(true);
    });
    this.promises.push(promise);
  }

  async send() {
    await Promise.all(this.promises);
    for (const file of this.files) {
      if (fs.existsSync(file)) {
        await this.ftp.sendFile(file, file);
        fs.unlinkSync(file);
      }
    }
  }
}
