export interface ICSV {
  read(file: string): Promise<Record<string, string | number | boolean>[]>;
  write(data: Record<string, string | number | boolean>, file: string): Promise<void>;
}