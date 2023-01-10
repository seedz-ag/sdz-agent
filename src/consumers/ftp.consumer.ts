import { IFtpClient } from 'interfaces/ftp-client.interface'

export const FtpConsumer = ({ FtpClient }: { FtpClient: IFtpClient }) => async (remote: string, local: string) => {
  return FtpClient.get(remote, local)
}
