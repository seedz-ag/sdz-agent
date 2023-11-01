export interface IFlattenDataSet<TDataTypes = any> {
  [key: Uppercase<string>]: TDataTypes;
}
