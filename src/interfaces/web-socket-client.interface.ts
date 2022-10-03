export interface IWebSocketClient {
  getConfig(): Promise<any>
  saveConfig(): Promise<any>
}