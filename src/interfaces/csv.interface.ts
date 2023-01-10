export interface ICSV {
  read: (file: string) => Promise<Array<Record<string, string | number | boolean>>>
  write: (data: Record<string, string | number | boolean>, file: string) => Promise<void>
}

export type ICSVConsumer = (file: string) => Promise<Array<Record<string, string | number | boolean>>>
