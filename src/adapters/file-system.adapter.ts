import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'

import { IFileSystem } from 'interfaces/file-system.interface'

export const FileSystemAdapter = ({ type }: { type?: string }): IFileSystem => {
  let driver: any
  switch (type) {
    case 'local':
    default:
      driver = {
        delete: unlinkSync,
        exists: existsSync,
        read: (path: string): string => readFileSync(path).toString(),
        write: writeFileSync
      }
  }
  return {
    async delete (path: string): Promise<void> {
      driver.delete(path)
    },
    async exists (path: string): Promise<boolean> {
      return driver.exists(path)
    },
    async read (file: string): Promise<string> {
      return driver.read(file)
    },
    async write (path: string, data: string): Promise<void> {
      driver.write(path, data)
    }
  }
}
