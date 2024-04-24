import axios, { Axios, AxiosRequestHeaders } from "axios";
import https from "https";
import { singleton } from "tsyringe";

import { IHttpClientRequestConfig } from "../interfaces/http-client-request-config.interface";

type HttpClientAdapterGetClientInput = {
  rejectUnauthorized?: boolean;
};

type HttpClientAdapterRequestInput<T = any> = {
  data?: T;
  method?: string;
  url: string;
} & IHttpClientRequestConfig;

@singleton()
export class HttpClientAdapter {
  private getClient({
    rejectUnauthorized,
  }: HttpClientAdapterGetClientInput): Axios {
    return axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized,
      }),
    });
  }

  private getCertificate(headers: AxiosRequestHeaders) {
    return headers['Certificate-Authority'] && String(headers['Certificate-Authority']) || undefined
  }

  private isInsecure(headers: AxiosRequestHeaders) {
    return Object.keys(headers)
      .map((key) => key.toUpperCase())
      .includes("INSECURE");
  }

  public async delete<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).delete<T>(url, config);
    return data;
  }

  public async get<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).get<T>(url, config);
    return data;
  }

  public async head<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).head<T>(url, config);
    return data;
  }

  public async options<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).options(url, config);
    return data;
  }

  public async patch<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).patch<T>(url, payload, config);
    return data;
  }

  public async post<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).post<T>(url, payload, config);
    return data;
  }

  public async put<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.getClient({
      rejectUnauthorized: !this.isInsecure(headers),
    }).put<T>(url, payload, config);
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
      httpsAgent: new https.Agent({
        rejectUnauthorized: !this.isInsecure(headers || {}),
        ca: this.getCertificate(headers || {}),
      }),
      method,
      responseType,
      timeout,
      url,
    });
    return response.data;
  }
}
