import axios, { Axios } from "axios";
import https from "https";
import { singleton } from "tsyringe";

import { IHttpClientRequestConfig } from "../interfaces/http-client-request-config.interface";

type HttpClientAdapterRequestInput<T = any> = {
  data?: T;
  method?: string;
  url: string;
} & IHttpClientRequestConfig;

@singleton()
export class HttpClientAdapter {
  private client: Axios = axios.create({
    httpsAgent: new https.Agent({
      rejectUnauthorized: false,
    }),
  });

  public async delete<T>(
    url: string,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.delete<T>(url, config);
    return data;
  }

  public async get<T>(
    url: string,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.get<T>(url, config);
    return data;
  }

  public async head<T>(
    url: string,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.head<T>(url, config);
    return data;
  }

  public async options<T>(
    url: string,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.options(url, config);
    return data;
  }

  public async patch<T, K = any>(
    url: string,
    payload: K,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.patch<T>(url, payload, config);
    return data;
  }

  public async post<T, K = any>(
    url: string,
    payload: K,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.post<T>(url, payload, config);
    return data;
  }

  public async put<T, K = any>(
    url: string,
    payload: K,
    config?: IHttpClientRequestConfig
  ): Promise<T> {
    const { data } = await this.client.put<T>(url, payload, config);
    return data;
  }

  public async request<T = any, K = any>({
    data,
    headers,
    method,
    responseType,
    timeout,
    url,
  }: HttpClientAdapterRequestInput<T>): Promise<T> {
    const response = await axios({
      data,
      headers,
      method,
      responseType,
      timeout,
      url,
    });
    return response.data;
  }
}
