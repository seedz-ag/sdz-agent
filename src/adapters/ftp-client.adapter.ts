import SFTPClient, { ConnectOptions } from "ssh2-sftp-client";

import { IFtpClient } from '@/interfaces/ftp-client.interface'

export const FtpClientAdapter = ({ config }: { config: ConnectOptions }): IFtpClient => {
  const client = new SFTPClient();
  return {
    get: async (remote: string, local: string): Promise<boolean> => {
      let complete = false
      try {
        await client.connect(config);
        await client
        .fastGet(remote, local, {
          step: function (total_transferred: any, chunk: any, total: any) {},
        })
        .then(() => {
          client.end();
        })
        .catch((err: TypeError) => {
          throw err;
        });
        complete = true;
      } catch (e) {
        throw e;
      }
      return complete;
    },
  }
}