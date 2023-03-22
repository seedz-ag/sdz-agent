export interface IXMLAdapter<T = Record<string, string | number | Date>> {
  parse: (data: string) => Promise<T>
}

export type IXMLConsumer<T> = (data: string) => Promise<T>
