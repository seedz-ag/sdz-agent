import { CSVAdapter } from "./csv.adapter"

describe('FileSystem Adapter', () => {
  const instance = CSVAdapter({ });

  test('it should be defined', () => {
    expect(instance).toBeDefined()
  })
})
