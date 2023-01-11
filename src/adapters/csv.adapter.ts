import { ICSVAdapter, ICSVData, ICSVResultSet, ICSVRow } from '../interfaces/csv.interface'
import { createReadStream, createWriteStream } from 'fs'

import CsvReadableStream from 'csv-reader'

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
  write: async (data: ICSVData , file: string): Promise<void> => {
    const stream = createWriteStream(file)
    const headers = Object.keys(data[0])
    data.forEach((row) => {
      const temp: string[] = []
      headers.forEach((column) => {
        temp.push(`"${row[column]}`)
      })
      stream.write(temp.join(';'))
    })
    stream.end()
  }
})
