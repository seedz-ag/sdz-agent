export interface IFtpClient {
  get(remote: string, local: string): Promise<boolean>
}