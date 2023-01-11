export type IDatabaseDefaultRow = Record<string, string | number | boolean | Date>

export type IDatabaseDefaultResultSet = IDatabaseDefaultRow[]

export type IDatabaseConsumer<T> = (query: string) => Promise<T>

export interface IDatabase {
  query: <T = IDatabaseDefaultResultSet> (query: string) => T
}
