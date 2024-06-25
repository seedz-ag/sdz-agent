import * as csv from "fast-csv";
import * as fs from "fs";
import { CsvOptionsInterface } from "sdz-agent-types";
import { singleton } from "tsyringe";
import { LoggerAdapter } from "./logger.adapter";

@singleton()
export class CSVAdapter {
  private fileNameCache: { [key: string]: number } = {};
  private fileSize: number | undefined;
  private legacy: boolean;
  private pad: string;

  constructor(private readonly loggerAdapter: LoggerAdapter) {
    this.fileSize = Infinity;
    this.pad = "000";
  }

  /**
   * Generate a file name based at actual count.
   *
   * @param {string} path
   * @return {string}
   */
  private generateName(path: string): string {
    if (!this.fileNameCache[path]) {
      this.fileNameCache[path] = 0;
    }
    const file = path.split(/\.(?=[^\.]+$)/);
    const pad = `${this.pad}${this.fileNameCache[path]}`.slice(
      -this.pad.length
    );
    return [file[0], pad, file[1]].join(".");
  }

  /**
   * Search for a file with available size.
   *
   * @param {string} path
   * @returns {string}
   */
  private getFile(path: string): string {
    if (!this.fileSize) {
      return path;
    }

    while (true) {
      const name = this.generateName(path);
      if (!fs.existsSync(name)) {
        return name;
      }
      const size: number = fs.statSync(name).size / (1024 * 1024);
      if (size < this.fileSize) {
        return name;
      } else {
        this.fileNameCache[path]++;
      }
    }
  }

  /**
   * Build CsvFormatterOptions.
   *
   * @return {CsvFormatterOptions}
   */
  private getFormat() {
    return {
      ...(this.legacy
        ? {
            delimiter: ";",
            writeHeaders: true,
          }
        : {
            delimiter: ",",
            quoteColumns: true,
            quoteHeaders: true,
          }),
      escape: '"',
      writeHeaders: true,
    };
  }

  /**
   * Read a CSV file.
   *
   * @param {string} path
   * @param {CsvOptionsInterface} options
   * @returns {Promise<any>}
   */
  read(path: string, options: CsvOptionsInterface) {
    return new Promise((resolve): any => {
      let result: Array<string> = [];
      fs.createReadStream(path)
        .on("error", (error) => {
          this.loggerAdapter.log("error", error);
        })
        .pipe(
          csv.parse({
            headers: true,
            ...options,
          })
        )
        .on("data", (row: string) => result.push(row))
        .on("end", () => resolve(result));
    });
  }
  /**
   * Read a CSV file.
   *
   * @param {string} data
   * @param {CsvOptionsInterface} options
   * @returns {Promise<any>}
   */
  parseToJson(data: string, options: CsvOptionsInterface) {
    return new Promise((resolve): any => {
      let result: Array<string> = [];
          csv.parseString(data, {
            headers: true,
            ...options,
          })
        .on("data", (row: string) => result.push(row))
        .on("end", () => resolve(result));
    });
  }

  /**
   * Write a file.
   *
   * @param {string} path
   * @param {array} data
   * @returns {Promise<void>}
   */
  async write(path: string, data: any[]) {
    const file = this.getFile(path.endsWith(".csv") ? path : `${path}.csv`);
    const isAppend = fs.existsSync(file);
    !isAppend && fs.writeFileSync(file, "");
    return new Promise((resolve) => {
      const buffer = fs.createWriteStream(file, { flags: "a" });

      if (isAppend) {
        buffer.write("\r\n");
      }

      buffer.on("finish", resolve);

      const stream = csv.format({
        ...this.getFormat(),
        headers: isAppend ? false : Object.keys(data[0]),
      });

      stream.pipe(buffer);

      for (const entity of data) {
        stream.write(entity);
      }

      stream.end();
    });
  }
}
