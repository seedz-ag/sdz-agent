export type IDatabaseDefaultRow = Record<string, string | number | boolean | Date>

export type IDatabaseDefaultResultSet = Array<IDatabaseDefaultRow>

export interface IDatabase {
  query: <T> (query: string) => T | IDatabaseDefaultResultSet 
}
