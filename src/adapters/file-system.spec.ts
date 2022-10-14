import { FileSystemAdapter } from './file-system'

describe('FileSystem Adapter', () => {
  const local = FileSystemAdapter({ type: 'local' });

  test('it should be defined', () => {
    expect(FileSystemAdapter).toBeDefined()
  })

  test('file should not exist', async () => {
    expect(await local.exists('absct.json')).toBeFalsy()
  })

  test('file should exist', async () => {
    expect(await local.exists('package.json')).toBeTruthy()
  })

  test('it should read a file', async () => {
    const file = await local.read('package.json')
    expect(file).toBeDefined()
  })

  test('it should write and delete a file', async () => {
    const text = 'Hello world'
    await local.write('FileSystemAdapter.test', text)
    const file = await local.read('FileSystemAdapter.test')
    expect(file).toBe(text)
    local.delete('FileSystemAdapter.test')
    expect(await local.exists('FileSystemAdapter.test')).toBeFalsy()
  })
})
