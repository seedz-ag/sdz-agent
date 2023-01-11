import { IHttpClient, IHttpDefaultRequestData, IHttpDefaultResponse, IQueryString } from '@/interfaces/http-client.interface'

import axios from 'axios'

export const HttpClientAdapter = ({ baseURL }: { baseURL: string }): IHttpClient => {
  const client = axios.create({ baseURL })
  return {
    get: async <T = IHttpDefaultResponse> (endpoint: string, qs?: IQueryString) => {
      return client.get(endpoint)
    },
    post: async <T = IHttpDefaultRequestData> (endpoint: string, data?: T) => {
      return client.post(endpoint, data)
    }
  }
}
