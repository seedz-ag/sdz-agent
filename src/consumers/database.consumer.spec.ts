import { DatabaseConsumer } from './database.consumer'

describe('DatabaseConsumer', () => {
  let instance
  it('should be defined', () => {
    expect(DatabaseConsumer).toBeDefined()
  })

  it('should return the DatabaseConsumer instance', () => {
    instance = DatabaseConsumer({ Database: { query: jest.fn() } })
    expect(instance).toBeDefined()
  })

  it('should consume the Database', async () => {
    instance = DatabaseConsumer({ Database: { query: jest.fn() } })
    expect(await instance('query')).toBeUndefined()
  })
})
