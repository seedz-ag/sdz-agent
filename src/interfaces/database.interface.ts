export interface IDatabase {
  query: (query: string) => Array<Record<string, string | number | boolean | Date>>
}
