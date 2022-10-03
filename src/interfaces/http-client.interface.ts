export interface IHttpClient {
  get(): Promise<any>
  post(): Promise<any>
}