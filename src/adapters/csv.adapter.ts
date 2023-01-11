import { ICSVAdapter, ICSVData, ICSVResultSet, ICSVRow } from '../interfaces/csv.interface'

import CsvReadableStream from 'csv-reader'
import { createReadStream } from 'fs'

export const CSVAdapter = (): ICSVAdapter => ({
  read: async (file: string): Promise<ICSVResultSet> => {
    const temp: ICSVResultSet = []
    await new Promise<void>((resolve) => {
      const inputStream = createReadStream(file, 'utf8')
      inputStream
        .pipe(new CsvReadableStream({ parseNumbers: true, parseBooleans: true, trim: true }))
        .on('data', (row: ICSVRow) => {
          temp.push(row)
        })
        .on('end', function () {
          resolve()
        })
    })
    return temp
  },
  write: async <T = ICSVData> (data: T, file: string): Promise<void> => {}
})
