export type IHttpDefaultResponse = Record<string, any> | Record<string, any>[]

export type IHttpDefaultRequestData = Record<string, any> | Record<string, any>[]

export type IQueryString = Record<string, string | number | undefined>

export interface IHttpClient {
  get: <T = IHttpDefaultResponse> (endpoint: string, qs?: IQueryString) => Promise<T>
  post: <T = IHttpDefaultRequestData, K = IHttpDefaultResponse> (endpoint: string, data?: T) => Promise<K>
}
