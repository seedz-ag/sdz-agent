import { config } from 'dotenv'
import { auth } from '@/utils/auth'
import { HttpClientAdapter } from './adapters/http-client.adapter'
import { IsAlive } from './utils/is-alive'
import { ISetting } from './interfaces/setting.interface'
import { FileSystemAdapter } from './adapters/file-system.adapter'
import { JSONConsumer } from './consumers/json.consumer'
import { CSVConsumer } from './consumers/csv.consumer'
import { CSVAdapter } from './adapters/csv.adapter'
import { XMLConsumer } from './consumers/xml.consumer'
import { XMLAdapter } from './adapters/xml.adapter'
import { DatabaseAdapter } from './adapters/database.adapter'
import { S3Adapter } from './adapters/s3.adapter'

config()

void (async () => {
  const headers: Record<string, string> = {}

  // Setup Authentication Observable
  const authentication = auth()
  authentication.subscribe(
    ({ AccessToken }) => (headers.authorization = `Bearer ${AccessToken}`)
  )
  await authentication.promise

  // Setup Is Alive Protocol
  IsAlive(headers)

  // Get the Setting for given Client
  const AGENT_API = HttpClientAdapter({
    baseURL: String(process.env.AGENT_API),
  })
  const setting = await AGENT_API.get<ISetting>('/settings', undefined, {
    headers,
  })

  // Create API Instance
  const API = HttpClientAdapter({ baseURL: String(process.env.API) })

  // Setup DataSource
  let ds: any = null

  switch (setting.DataSource.toUpperCase()) {
    case 'API':
      ds = HttpClientAdapter({}).get
      break
    case 'DB':
      ds = DatabaseAdapter({
        Parameters: setting.Parameters.filter(({ Key }) =>
          Key.startsWith('DATABASE')
        )
      }).query
      break
    case 'FS':
      ds = FileSystemAdapter({}).read
      break
    case 'S3':
      ds = S3Adapter({}).read
      break
    default:
      throw new Error('DataSource missmatch')
  }

  // Process Schemas
  for (const schema of setting.Schemas) {
    let consumer: any

    const query = setting.Queries.find(({ Entity }) => schema.Entity === Entity)
    if (!query) {
      throw new Error(`Query not found for Entity ${schema.Entity}`)
    }

    // Setup Consumer
    switch (schema.InputFormat?.toUpperCase()) {
      case 'CSV':
        consumer = CSVConsumer({ CSV: CSVAdapter() })
        break
      case 'XML':
        consumer = XMLConsumer({ XML: XMLAdapter() })
        break
      default:
        consumer = JSONConsumer
    }

    // Read data from DataSource
    const data = await ds(query.Path || query.Command)

    // Consume Data into a Payload
    const payload = await consumer.apply(consumer, [data])

    console.log(payload)

    // Send Data to API
    // await API.post(schema.ApiResource, payload, { headers })
  }
})()
