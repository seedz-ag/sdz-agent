import { HttpClientAdapter } from '@/adapters/http-client.adapter'

export const IsAlive = (headers: Record<string, string>): void => {
  const HTTP = HttpClientAdapter({ baseURL: String(process.env.AGENT_API) })
  void Promise.all([
    HTTP.head('', { headers }),
    setInterval(async () => HTTP.head('', { headers }), 60000)
  ])
}
