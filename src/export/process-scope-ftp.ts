import fs from "fs";
import CSV from "sdz-agent-data";
import FTP from "sdz-agent-sftp";
import { ConfigAuthFTP } from "sdz-agent-types";

export default class ProcessScopeFTP {
  private csv: CSV;
  private files: string[];
  private ftp: FTP;
  constructor(config: ConfigAuthFTP, legacy: boolean) {
    this.csv = new CSV(legacy);
    this.ftp = new FTP(config);
    this.files = [];
  }

  async process(response: any) {
    if (!this.files.includes(response.meta.file)) {
      this.files.push(response.meta.file);
    }
    await this.csv.write(response.meta.file, response.data);
  }

  async send() {
    for (const file of this.files) {
      if (fs.existsSync(file)) {
        await this.ftp.sendFile(file, file);
        fs.unlinkSync(file);
      }
    }
  }
}
