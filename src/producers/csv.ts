import { IFileSystem } from "interfaces/file-system.interface";

export const CSVProducer =
  ({ FileSystem }: { FileSystem: IFileSystem }) =>
  (data: any[], destination: string) => {
    const file = FileSystem.read(destination);
    FileSystem.write([file, data.join("\n")].join("\n"), destination);
  };
