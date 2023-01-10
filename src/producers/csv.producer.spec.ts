import { CSVProducer } from './csv.producer'

describe('CSVProducer', () => {
  let instance
  const FileSystem = { delete: jest.fn(), exists: jest.fn(), read: jest.fn(), write: jest.fn() }
  it('should be defined', () => {
    expect(CSVProducer).toBeDefined()
  })

  it('should return a CSVProducer instance', () => {
    instance = CSVProducer({ FileSystem })
    expect(instance).toBeDefined()
  })

  it('should call write method on FileSystem', async () => {
    const data = { name: '' }
    const path = '/'
    const writeSpy = jest.spyOn(FileSystem, 'write')
    instance = CSVProducer({ FileSystem })
    await instance(path, data)
    expect(writeSpy).toHaveBeenCalledWith(path, JSON.stringify(data))
  })
})
