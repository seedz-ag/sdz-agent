export interface IDataSet<TDataTypes = any> {
  [key: string]: TDataTypes;
}

export type IResultSet<TDataTypes = any> = IDataSet<TDataTypes>[];
