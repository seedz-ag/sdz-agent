import { HttpClientAdapter } from './http-client.adapter'
import { IHttpClient } from '../interfaces/http-client.interface'
import axios from 'axios'

describe('HttpClientAdapter', () => {
  const baseURL = 'http://localhost/'
  const data = { value: 'any-value' }
  const endpoint = 'get'

  let client: IHttpClient

  it('should be defined', () => {
    expect(HttpClientAdapter).toBeDefined()
  })

  it('should call axios create method', () => {
    const createSpy = jest.spyOn(axios, 'create')
    client = HttpClientAdapter({ baseURL })
    expect(createSpy).toHaveBeenCalledWith({ baseURL })
  })

  it('should call axios get method', async () => {
    const getSpy = jest.spyOn(axios, 'get')
    await client.get(endpoint)
    expect(getSpy).toHaveBeenCalledWith(endpoint)
  })

  it('should call axios post method', async () => {
    const postSpy = jest.spyOn(axios, 'post')
    await client.post(endpoint, data)
    expect(postSpy).toHaveBeenCalledWith(endpoint, data)
  })
})
