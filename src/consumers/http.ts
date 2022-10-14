import { IHttpClient } from "interfaces/http-client.interface";

export const HttpConsumer = ({ HttpClient }: { HttpClient: IHttpClient }) => (method: string, endpoint: string, data?: Array<Record<string, any>> | Record<string, any> ) => {
  return HttpClient[method as keyof IHttpClient](endpoint, data)
}