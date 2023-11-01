import { ResponseType } from "axios";

export type IHttpClientRequestConfig = {
  headers?: Record<string, string>;
  responseType?: ResponseType;
  timeout?: number;
};
