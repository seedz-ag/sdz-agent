import { IDatabase, IDatabaseDefaultResultSet } from 'interfaces/database.interface'

export const DatabaseConsumer = ({ Database }: { Database: IDatabase }) => async <T = IDatabaseDefaultResultSet> (query: string): Promise<T> => Database.query(query)
