export interface ICredentials {
  Password: string;
  Username: string;
}

export interface IMap {
  From: string;
  To: string;
}

export interface IParameter {
  Key: string;
  Value: string;
}

export interface IQuery {
  Command: string;
  Entity: string;
}

export interface ISchedule {
  CronExpression: string;
}

export interface ISchema {
  ApiResource: string;
  Entity: string;
  InputFormat: "AGENT" | "JSON";
  Maps: IMap[];
}

export interface ISecurity {
  Config: string;
  Credentials: ICredentials;
  Type: "vpn";
}

export interface ISetting {
  Channel: string;
  DataSource: string;
  Parameters: IParameter[];
  Queries: IQuery[];
  Schedules: ISchedule[];
  Schemas: ISchema[];
  Security: ISecurity;
}
