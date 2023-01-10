import { HttpClientAdapter } from '@/adapters/http-client.adapter'
import { HttpConsumer } from './http.consumer'
import axios from 'axios'

describe('HttpConsumer', () => {
  const baseURL = 'http://localhost'

  let instance
  it('should be defined', () => {
    expect(HttpConsumer).toBeDefined()
  })
  it('should return an instance of HttpConsumer', () => {
    instance = HttpConsumer({ HttpClient: HttpClientAdapter({ baseURL }) });
    expect(instance).toBeDefined()
  })

  it('should do a GET request', async () => {
    instance = HttpConsumer({ HttpClient: HttpClientAdapter({ baseURL }) });
    const getSpy = jest.spyOn(axios, 'get')
    await instance('get', '', {})
    expect(getSpy).toHaveBeenCalled()
  })
})
