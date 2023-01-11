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
    const Database = { query: jest.fn().mockImplementation((query: string) => ([{ query }])) };
    
    const spy = jest.spyOn(Database, 'query')

    instance = DatabaseConsumer({ Database })
    const resultSet = await instance('query')
    expect(resultSet).toHaveLength(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})
