export interface IHttpClient {
  get: (endpoint: string, qs?: Record<string, any>) => Promise<any>
  post: (endpoint: string, data?: Record<string, any>) => Promise<any>
}
