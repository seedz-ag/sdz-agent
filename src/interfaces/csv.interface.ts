export type ICSVRow = Record<string, string | number | boolean | Date>

export type ICSVResultSet = ICSVRow[]

export type ICSVData = ICSVRow[]

export interface ICSV {
  read: <T = ICSVResultSet> (file: string) => Promise<T>
  write: <T = ICSVData> (data: T, file: string) => Promise<void>
}

export type ICSVConsumer<T> = (file: string) => Promise<T>
