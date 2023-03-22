export interface IParameter {
  Id: string
  Key: string
  Value: string
}

export interface ISetting {
  DataSource: string
  Parameters: IParameter[]
  Queries: IQuery[]
  Schemas: ISchema[]
}

export interface IQuery {
  Command: string
  Entity: string
  Id: string
  Path: string
}

export interface ISchema {
  ApiResource: string
  Entity: string
  Id: string
  InputFormat: string
  Maps: IMap[]
  OutputFormat: string
}

export interface IMap {
  From: string
  Id: string
  Pattern: string
  To: string
}
