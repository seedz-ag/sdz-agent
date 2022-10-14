export interface IFileSystem {
  delete(path: string): Promise<void>
  exists(path: string): Promise<boolean>
  read(path: string): Promise<string>
  write(path: string, data: string): Promise<void>
}