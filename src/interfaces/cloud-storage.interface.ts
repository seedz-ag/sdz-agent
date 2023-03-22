export interface ICloudStorage {
  list: (path: string) => Promise<unknown>
  read: (path: string) => Promise<unknown>
  [x: string | number | symbol]: unknown
}
