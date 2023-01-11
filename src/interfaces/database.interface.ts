export type IDatabaseDefaultRow = Record<string, string | number | boolean | Date>

export type IDatabaseDefaultResultSet = IDatabaseDefaultRow[]

export interface IDatabase {
  query: <T = IDatabaseDefaultResultSet> (query: string) => T 
}
