import { CSVConsumer } from "./csv.consumer";
import { ICSVConsumer } from "../interfaces/csv.interface";

describe('CSV Consumer', () => {
  let instance: ICSVConsumer;

  beforeEach(() => {
    instance = CSVConsumer({ CSV: { read: jest.fn(), write: jest.fn() } });
  });
  it('should be defined', () => {
    expect(CSVConsumer).toBeDefined()
  })

  it('should return the CSV Consumer instance', () => {
    expect(instance).toBeDefined()
  })

  it('should consume the CSV', async () => {
    expect(await instance('file')).toBeUndefined()
  })
})
