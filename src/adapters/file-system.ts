import { existsSync, readFileSync, writeFileSync } from "fs";

import { IFileSystem } from "interfaces/file-system.interface";

export const FileSystem = ({ type }: { type: string }): IFileSystem => {
  let driver: any;
  switch (type) {
    default:
      driver = {
        exists: existsSync,
        read: readFileSync,
        write: writeFileSync,
      }
  }
  return {
    async read(file: string): Promise<string> {
      return driver.read(file)
    },
    async write(localFile: string, destination: string): Promise<void> {
      driver.write(localFile, destination)
    }
  }
}