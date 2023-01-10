import { FtpConsumer } from './ftp.consumer'
import { IFtpConsumer } from '../interfaces/ftp.interface'

describe('FtpConsumer', () => {
  let instance: IFtpConsumer
  it('should be defined', () => {
    expect(FtpConsumer).toBeDefined()
  })

  beforeEach(() => {
    instance = FtpConsumer({ FtpClient: { get: jest.fn() } })
  })

  it('should return the FtpConsumer instance', () => {
    expect(instance).toBeDefined()
  })

  it('should consume the Ftp', async () => {
    expect(await instance('remote', 'local')).toBeUndefined()
  })
})
