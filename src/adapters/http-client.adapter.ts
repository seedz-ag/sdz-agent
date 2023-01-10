import { IHttpClient } from '@/interfaces/http-client.interface'
import axios from 'axios'

export const HttpClientAdapter = ({ baseURL }: { baseURL: string }): IHttpClient => {
  const client = axios.create({ baseURL })
  return {
    get: async (endpoint: string, qs: Record<string, any>) => {
      return client.get(endpoint)
    },
    post: async (endpoint: string, data: Record<string, any>) => {
      return client.post(endpoint, data)
    }
  }
}
