import { IDatabase } from 'interfaces/database.interface'

export const DatabaseConsumer = ({ Database }: { Database: IDatabase }) => async (query: string): Promise<Array<Record<string, string | number | boolean | Date>>> => {
  return Database.query(query)
}
