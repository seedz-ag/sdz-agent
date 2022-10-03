export interface IFileSystem {
  read(path: string): Promise<string>
  write(data: string, destination: string): Promise<void>
}