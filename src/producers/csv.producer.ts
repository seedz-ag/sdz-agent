import { IFileSystem } from 'interfaces/file-system.interface'

export const CSVProducer =
  ({ FileSystem }: { FileSystem: IFileSystem }) =>
    async (path: string, data: Array<Record<string, any>> | Record<string, any>) => {
      await FileSystem.write(path, JSON.stringify(data))
    }
