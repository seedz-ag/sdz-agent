import { Config } from "sdz-agent-types";
import FTP from "sdz-agent-sftp";
import { Logger } from "sdz-agent-common";
import fs from "fs";

let config: Config;
let instance: FTP;

const transport = async (local: string, destination: string) => {
  if (!instance) {
    Logger.info("VALIDATING CLIENT FTP");
    (new FTP(config.ftp)).connect();
    instance = new FTP(config.ftp);
  }
  if (fs.existsSync(local)) {
    await instance.sendFile(local, destination);
  }
};

transport.setConfig = (c: Config) => config = c;

export default transport;
