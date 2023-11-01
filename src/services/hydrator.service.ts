import { get, set } from "dot-wild";
import moment from "moment";
import { singleton } from "tsyringe";
import { IDataSet } from "../interfaces/result-set.interface";
import { IFlattenDataSet } from "../interfaces/flatten-data-set.interface";
import { randomUUID } from "node:crypto";
import { IMap } from "interfaces/setting.interface";

const pipes = {
  Append: (row: IDataSet, value: unknown, args: string[]) =>
    `${value || ``}${args[0]}`,
  Capitalize: (row: IDataSet, value: unknown, args: string[]) =>
    value && "string" === typeof value && value.toUpperCase(),
  Concat: (row: IDataSet, value: unknown, args: string[]) => {
    return value + get(row, args[0].toUpperCase(), "");
  },
  Now: () => moment().format("YYYY-MM-DD"),
  Prepend: (row: IDataSet, value: unknown, args: string[]) =>
    `${args[0]}${value || ``}`,
  SetValue: (row: IDataSet, value: unknown, args: string[]) => args[0],
  UUID: () => randomUUID(),
};

type Pipes = keyof typeof pipes | undefined;

@singleton()
export class HydratorService {
  private flatten<T = any>(obj: any): IFlattenDataSet<T> {
    let result: any = {};
    for (const i in obj) {
      if (Array.isArray(obj[i])) {
        for (const j in obj[i]) {
          const temp = this.flatten(obj[i][j]);
          Object.keys(temp).forEach(
            (key) =>
              (result[`${j.toUpperCase()}.${key}`] =
                temp[key as Uppercase<string>])
          );
        }
      } else if (typeof obj[i] === "object") {
        const temp = this.flatten(obj[i]);
        for (const j in temp) {
          result[i.toUpperCase() + "." + j.toUpperCase()] =
            temp[j as Uppercase<string>];
        }
      } else {
        result[i.toUpperCase()] = obj[i];
      }
    }
    return result;
  }

  public hydrate(mapping: IMap[], row: IDataSet): IDataSet {
    const hydrated: IDataSet = {};

    const flattened = this.flatten<string>(row);

    const normalized: Record<string, any> = Object.keys(flattened).reduce(
      (previous, current) => {
        return set(previous, current, flattened[current as Uppercase<string>]);
      },
      {}
    );

    return mapping.reduce((previous, { From, To }) => {
      let value = `${
        From ? flattened[`${From}`.toUpperCase() as Uppercase<string>] : ``
      }`.trim();

      if (To.match(/\|/)) {
        const pipe: string[] = To.split(/\|/g);
        if (pipe.length) {
          To = pipe[0];
          pipe.slice(1).forEach((pipe) => {
            const reg = new RegExp(/(.*?)\((.*?)\)/g);
            const matches = reg.exec(pipe);
            if (!matches?.length) {
              return;
            }
            matches.shift();
            const key = matches.shift() as Pipes;
            if (!key) {
              return;
            }
            const args = matches.shift()?.split(/,/g) || [];
            value = pipes[key](normalized, value, args);
            normalized[`${From || To}`.toUpperCase()] = value;
          });
        }
      }

      previous[To] = get(normalized, String(From || To).toUpperCase(), "");

      return previous;
    }, hydrated);
  }
}
