import { IFileSystem } from "interfaces/file-system.interface";

export const JSONProducer =
  ({ FileSystem }: { FileSystem: (...args: any[]) => IFileSystem }) =>
  ({ type }: { type: string }) =>
  async (data: any[], destination: string) => {
    const fileSystem = FileSystem({ type });
    let array = [];
    try {
      array = JSON.parse(await fileSystem.read(destination));
    } catch {}
    await fileSystem.write(JSON.stringify(array, null, "\t"), destination);
  };
