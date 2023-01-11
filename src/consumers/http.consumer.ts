import { IHttpClient, IHttpDefaultRequestData, IHttpDefaultResponse, IQueryString } from 'interfaces/http-client.interface'

export const HttpConsumer = ({ HttpClient }: { HttpClient: IHttpClient }) =>
  async <T =IHttpDefaultRequestData | IQueryString, K = IHttpDefaultResponse> (method: string, endpoint: string, data?: T): Promise<K | undefined> => {
    switch (method.toUpperCase()) {
      case 'GET':
        return HttpClient.get<K>(endpoint, data as IQueryString)
      case 'POST':
        return HttpClient.post<T, K>(endpoint, data)
    }
  }
