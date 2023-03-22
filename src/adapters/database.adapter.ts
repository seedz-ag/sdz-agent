import { IDatabase } from '@/interfaces/database.interface'
import { IParameter } from '@/interfaces/setting.interface'
import { SUPPORTED_DATABASES } from '@/interfaces/supported-databases.enum'

export const DatabaseAdapter = ({ Parameters }: { Parameters: IParameter[] }): IDatabase => {
  const Find = (needle: string): IParameter | undefined => Parameters.find(({ Key }) => Key === needle)

  const DRIVER = Find('DATABASE_DRIVER')?.Value

  let driver: any = null
  let query: any = (): any => { return null }

  switch (DRIVER?.toUpperCase()) {
    case SUPPORTED_DATABASES.MYSQL:
      break
    case SUPPORTED_DATABASES.SQLITE3:
      driver = new (require('sqlite3')).Database(`./${Find('DATABASE_HOST')?.Value}`)
      query = async (sql: string) => new Promise((resolve, reject) => driver.get(sql, [], (err: any, row: any) => { if (err) { reject(err) } resolve(row) }))
      break
    default:
      throw new Error('Database Driver not found')
  }

  return { query }
}
