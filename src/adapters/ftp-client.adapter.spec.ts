import { FtpClientAdapter } from './ftp-client.adapter'

describe('FTP Adapter', () => {
  const local = FtpClientAdapter({ config: {} })

  test('it should be defined', () => {
    expect(FtpClientAdapter).toBeDefined()
  })

  test('it should have get function', () => {
    expect(local.get).toBeDefined()
  })
})
