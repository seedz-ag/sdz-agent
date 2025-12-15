declare module "xml-stream" {
  import { Readable } from "stream";

  interface XmlStreamOptions {
    encoding?: string;
    trim?: boolean;
    normalize?: boolean;
    lowercase?: boolean;
    xmlns?: boolean;
    ns?: Record<string, string>;
    stream?: boolean;
  }

  class XmlStream extends Readable {
    constructor(stream: NodeJS.ReadableStream, options?: XmlStreamOptions);
    collect(name: string): void;
    preserve(name: string): void;
    on(event: string, callback: (data: any) => void): this;
    pause(): void;
    resume(): void;
  }

  export = XmlStream;
}

