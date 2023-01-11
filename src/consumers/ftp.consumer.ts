import { IFtpClient } from 'interfaces/ftp.interface'

export const FtpConsumer = ({ FtpClient }: { FtpClient: IFtpClient }) => async (remote: string, local: string) => {
  return FtpClient.get(remote, local)
}
