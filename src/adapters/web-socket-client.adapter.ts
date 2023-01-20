import { Socket, io } from 'socket.io-client'
import { killProcess } from '../utils/kill-process'
// import { bootstrap } from '../../index.js'
import { exec } from 'child_process'
import { closeSync, existsSync, openSync } from 'fs'

let connected = false
let connecting = false

export const WebSocketAdapter = async ({ token }: any): Promise<any> => {
  const instance = await connect(token)

  void watchConnection(instance, token)()

  instance.on('connect', () => {
    connected = true
    listen(instance)
  })

  instance.on('disconnect', async () => {
    connected = false
    await killProcess()
  })

  return {
    executeQuery: async (...args: string[]) => {
      const requesterId = args.pop() ?? ''
      return response(instance)(requesterId, [await executeQuery(await getConfig(instance), args[1] || '')])
    },
    getConfig: async () => getConfig(instance),
    getDTO: async (entity: string) => {
      return getDTO(instance)(entity)
    },
    getHttpRequest: async (entity: string) => {
      return getHttpRequest(instance)(entity)
    },
    getSQL: async (entity: string) => {
      return getSQL(instance)(entity)
    },
    isConnected: () => connected,
    run: async (...args: string[]) => {
      const requesterId = args.pop() ?? ''
      return response(instance)(requesterId, [await run(await getConfig(instance), args[1])])
    },
    runLocalCommand: async (...args: string[]) => {
      const requesterId = args.pop() ?? ''
      return response(instance)(requesterId, [await runLocalCommand(...args)])
    },
    saveConfig: async (config: any) => {
      return saveConfig(instance)(config)
    },
    update: async (...args: string[]) => {
      const requesterId = args.pop() ?? ''
      await response(instance)(requesterId, [await update()])
      const configFile = `${process.env.CONFIGDIR}/config.json`
      if (existsSync(configFile)) {
        closeSync(openSync(configFile, 'w'))
      }
    }
  }
}

const connect = async (token: string): Promise<Socket> => {
  connecting = true
  const instance = io(`${process.env.WS_SERVER_URL}`, {
    path: '/integration/agentws',
    query: { token },
    upgrade: false,
    timeout: 30000,
    transports: ['websocket']
  })
  connecting = false
  return instance
}

const listen = (instance: Socket): any => {
  instance.on('sdz-exec', exec.bind(instance))
  instance.on('sdz-execute-query', executeQuery.bind(instance))
  instance.on('sdz-run', run.bind(this))
  instance.on('sdz-update', update.bind(this))
}

let timer: NodeJS.Timeout
export const watchConnection = (instance: Socket, token: string) => async () => {
  clearTimeout(timer)
  try {
    if (!connected && !connecting) {
      connect(token)
    }
    timer = setTimeout(() => watchConnection(instance, token), 60000)
  } catch (e: any) {
    console.error(e)
  }
}

const executeQuery = async (config: Config | Config[], query: string, configName = 'default'): Promise<DatabaseRow[]> => {
  const chosenConfig: Config = config instanceof Array ? config.find(c => c.name === configName) || config.find(c => c.name === 'default') || config[0] : config
  const database = new Database(chosenConfig.database)
  const result = await database.getConnector().execute(query)
  return result
}

const getConfig = (instance: Socket) => async () => {
  return new Promise((resolve) => {
    instance.emit('get-config', (response: any) => {
      resolve(response)
    })
  })
}

export const getDTO = (instance: Socket) => async (entity: string) => {
  return new Promise((resolve) => {
    instance.emit('get-dto', entity, (response: any) => {
      resolve(response)
    })
  })
}

export const getHttpRequest = (instance: Socket) => async (entity: string) => {
  return new Promise((resolve) => {
    instance.emit('get-http-request', entity, (response: any) => {
      resolve(response)
    })
  })
}

export const getSQL = (instance: Socket) => async (entity: string) => {
  return new Promise((resolve) => {
    instance.emit('get-query', entity, (response: any) => {
      resolve(response)
    })
  })
}

export const response = (instance: Socket) => async (requesterId: string, data: any): Promise<void> => {
  instance.emit('sdz-response', requesterId, ...data)
}

export const run = async (config: any, args: string): Promise<boolean> => {
  let configName = 'default'
  if (args) {
    args.split('--').forEach(arg => {
      const needle = arg.split('=')[0]
      const index = process.argv.findIndex(arg => arg.includes(needle))
      if (index === -1) {
        process.argv.push(`--${arg}`.trim())
      } else {
        process.argv[index] = arg !== '' ? `--${arg}`.trim() : ''
      }
    })

    const argv: Record<string, any> = yargs(process.argv).argv

    configName = argv.config ? argv.config : configName
  }

  return new Promise(async (resolve) => {
    try {
      resolve(await bootstrap(configName))
    } catch (e) {
      resolve(false)
    }
  })
}

export const runLocalCommand = async (...args: string[]): Promise<string> => {
  return new Promise(async (resolve) => {
    await exec(args.pop() ?? '', (error, stdout, stderr) => {
      resolve((error && stderr) ?? stdout)
    })
  })
}

export const saveConfig = (instance: Socket) => async (config: any) => {
  return new Promise((resolve) => {
    instance.emit('save-config', config)
  })
}

export const update = async (): Promise<string> => {
  return new Promise(async (resolve) => {
    await exec('git pull', (error, stdout, stderr) => {
      resolve((error && stderr) || stdout)
    })
  })
}
