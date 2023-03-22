import { HttpClientAdapter } from '@/adapters/http-client.adapter'
import { ICredentials } from '@/interfaces/credentials.interface'
import { Observable } from '@/interfaces/observable.interface'
import { ITokenResponse } from '@/interfaces/token-response.interface'

let data: any = null
const subscribers: any[] = []

export const auth = (): Observable<ITokenResponse> => {
  const HTTP = HttpClientAdapter({ baseURL: String(process.env.AGENT_API) })
  const promise = HTTP.post<ICredentials, ITokenResponse>('auth', {
    ClientId: String(process.env.CLIENT_ID),
    ClientSecret: String(process.env.CLIENT_SECRET)
  }).then((value) => {
    data = value
    subscribers.forEach((subscriber) => subscriber(value))
    return value
  })
  return { promise, subscribe: (callback: any) => subscribers.push(callback) && data && callback(data) }
}
