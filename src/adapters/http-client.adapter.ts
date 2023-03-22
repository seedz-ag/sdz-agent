import { IHttpClient, IHttpDefaultRequestData, IHttpDefaultResponse, IQueryString } from '@/interfaces/http-client.interface'

import axios, { AxiosRequestConfig } from 'axios'

export const HttpClientAdapter = ({ baseURL }: { baseURL?: string }): IHttpClient => {
  const client = axios.create({ baseURL })
  return {
    get: async <T = IHttpDefaultResponse> (endpoint: string = '', qs?: IQueryString, config?: AxiosRequestConfig): Promise<T> => {
      return (await client.get(endpoint, config)).data
    },
    head: async (endpoint: string, config?: AxiosRequestConfig): Promise<void> => {
      await client.head(endpoint, config)
    },
    post: async <T = IHttpDefaultRequestData, K = IHttpDefaultResponse> (endpoint: string, data?: T, config?: AxiosRequestConfig): Promise<K> => {
      return (await client.post(endpoint, data, config)).data
    }
  }
}
