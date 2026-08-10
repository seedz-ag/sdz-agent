import axios, { Axios, AxiosRequestHeaders } from "axios";
import https from "https";
import { singleton } from "tsyringe";

import { IHttpClientRequestConfig } from "../interfaces/http-client-request-config.interface";
import { NetworkTelemetryRecorderService } from "../services/network-telemetry-recorder.service";

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
  private forbiddenHeaders = ["Certificate-Authority"];

  constructor(
    private readonly networkTelemetryRecorder: NetworkTelemetryRecorderService
  ) { }

  /**
   * Passively records latency + outcome (ok/error/timeout) of every real
   * HTTP call the agent makes, feeding the telemetry network window. No
   * active probing happens here, just observation of existing traffic.
   */
  private async timed<T>(promise: Promise<T>): Promise<T> {
    const startedAt = Date.now();
    try {
      const result = await promise;
      this.networkTelemetryRecorder.recordRequest("ok", Date.now() - startedAt);
      return result;
    } catch (error: any) {
      const isTimeout =
        "ECONNABORTED" === error?.code ||
        "ETIMEDOUT" === error?.code ||
        /timeout/i.test(error?.message || "");
      this.networkTelemetryRecorder.recordRequest(
        isTimeout ? "timeout" : "error",
        Date.now() - startedAt
      );
      throw error;
    }
  }

  private getClient({
    rejectUnauthorized,
  }: HttpClientAdapterGetClientInput): Axios {
    return axios.create({
      httpsAgent: new https.Agent({
        rejectUnauthorized,
      }),
    });
  }

  private filterHeaders(headers: AxiosRequestHeaders) {
    return Object.keys(headers)
      .filter((key) => !this.forbiddenHeaders.includes(key))
      .reduce<Record<string, string>>((acc, key) => {
        acc[key] = String(headers[key]);
        return acc;
      }, {});
  }

  private getCertificate(headers: AxiosRequestHeaders) {
    return (
      (headers["Certificate-Authority"] &&
        String(headers["Certificate-Authority"])) ||
      undefined
    );
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
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).delete<T>(url, config)
    );
    return data;
  }

  public async get<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).get<T>(url, config)
    );
    return data;
  }

  public async head<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).head<T>(url, config)
    );
    return data;
  }

  public async options<T>(
    url: string,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).options(url, config)
    );
    return data;
  }

  public async patch<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).patch<T>(url, payload, config)
    );
    return data;
  }

  public async post<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).post<T>(url, payload, config)
    );
    return data;
  }

  /**
   * Same as post(), but also returns response headers. Used by telemetry to
   * read the server's `Date` header and derive clock drift, without an
   * extra round-trip.
   */
  public async postRaw<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<{ data: T; headers: Record<string, string> }> {
    const { headers = {} } = config;
    const response = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).post<T>(url, payload, config)
    );
    return { data: response.data, headers: response.headers as Record<string, string> };
  }

  public async put<T, K = any>(
    url: string,
    payload: K,
    config: IHttpClientRequestConfig = {}
  ): Promise<T> {
    const { headers = {} } = config;
    const { data } = await this.timed(
      this.getClient({
        rejectUnauthorized: !this.isInsecure(headers),
      }).put<T>(url, payload, config)
    );
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
    const response = await this.executeRequest({
      data,
      headers,
      method,
      responseType,
      timeout,
      url,
    });
    return response.data;
  }

  public async requestStream({
    data,
    headers,
    method,
    timeout,
    url,
  }: Omit<HttpClientAdapterRequestInput, "responseType">): Promise<NodeJS.ReadableStream> {
    const response = await this.executeRequest({
      data,
      headers,
      method,
      responseType: "stream",
      timeout,
      url,
    });
    return response.data as NodeJS.ReadableStream;
  }

  private async executeRequest({
    data,
    headers,
    method,
    responseType,
    timeout,
    url,
  }: {
    data?: any;
    headers?: AxiosRequestHeaders;
    method?: string;
    responseType?: any;
    timeout?: number;
    url: string;
  }): Promise<any> {
    const filteredHeaders = this.filterHeaders(headers || {});
    const isInsecureRequest = this.isInsecure(headers || {});
    const certificate = this.getCertificate(headers || {});

    return this.timed(
      axios({
        data,
        headers: filteredHeaders,
        httpsAgent: new https.Agent({
          rejectUnauthorized: !isInsecureRequest,
          ca: certificate,
        }),
        method,
        responseType,
        timeout,
        url,
      })
    );
  }
}
