import { IDatabase } from 'interfaces/database.interface'

export const DatabaseConsumer = ({ Database }: { Database: IDatabase }) => async (query: string) => Database.query(query)
