export type ICSVRow = Record<string, string | number | boolean | Date>

export type ICSVResultSet = ICSVRow[]

export type ICSVData = ICSVRow[]

export interface ICSVAdapter<T = ICSVResultSet, K = ICSVData> {
  read: (file: string) => Promise<T>
  write: (data: K, file: string) => Promise<void>
}

export type ICSVConsumer<T> = (file: string) => Promise<T>
