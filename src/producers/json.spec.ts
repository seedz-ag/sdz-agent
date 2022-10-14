import { JSONProducer } from "./json"

describe('JSONProducer', () => {
  let instance;
  const FileSystem = { delete:jest.fn(), exists: jest.fn(), read: jest.fn(), write: jest.fn() }
  it('should be defined', () => {
    expect(JSONProducer).toBeDefined()
  })

  it('should return a JSONProducer instance', () => {
    instance = JSONProducer({ FileSystem  })
    expect(instance).toBeDefined()
  })

  it('should call write method on FileSystem', async () => {
    const data = { name: '' }
    const path = '/'
    const writeSpy = jest.spyOn(FileSystem, 'write')
    instance = JSONProducer({ FileSystem  })
    await instance(path, data);
    expect(writeSpy).toHaveBeenCalledWith(path, JSON.stringify(data))
  })
})
