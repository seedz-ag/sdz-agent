export interface IFtpClient {
  get: (remote: string, local: string) => Promise<boolean>
}

export type IFtpConsumer = (remote: string, local: string) => Promise<boolean>
