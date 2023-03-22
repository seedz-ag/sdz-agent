import { AxiosRequestConfig } from 'axios'

export type IHttpDefaultResponse = Record<string, any> | Array<Record<string, any>>

export type IHttpDefaultRequestData = Record<string, any> | Array<Record<string, any>>

export type IQueryString = Record<string, string | number | undefined>

export interface IHttpClient {
  get: <T = IHttpDefaultResponse> (endpoint: string, qs?: IQueryString, config?: AxiosRequestConfig) => Promise<T>
  head: (endpoint: string, config?: AxiosRequestConfig) => Promise<void>
  post: <T = IHttpDefaultRequestData, K = IHttpDefaultResponse> (endpoint: string, data?: T, config?: AxiosRequestConfig) => Promise<K>
}
