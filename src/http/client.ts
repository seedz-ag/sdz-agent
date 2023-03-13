import parser from "xml2json";
import axios from "axios";
import { get } from "dot-wild";
import https from "https";
import interpolation from "./interpolation";

export default class HttpClient {
  private authHeader?: any;
  private body?: string;
  private dataPath?: string;
  private headers: any;
  private method: string = "POST";
  private scope?: any;
  private insecure?: boolean;
  private url?: string;

  public constructor(
    url?: string,
    headers?: any,
    method?: string,
    scope?: any,
    insecure?: boolean,
    body?: string
  ) {
    this.setBody(body);
    this.setHeaders(headers);
    this.setMethod(method);
    this.setScope(scope);
    this.setInsecure(insecure);
    this.setURL(url);
  }

  // GETTERS AND SETTERS
  public getAuthHeader(): any {
    return this.authHeader;
  }
  public setAuthHeader(authHeader: any): this {
    this.authHeader = authHeader;
    return this;
  }

  public getBody(): string | undefined {
    return this.body;
  }
  public setBody(body?: string): this {
    this.body = body;
    return this;
  }

  public getDataPath(): string | undefined {
    return this.dataPath;
  }
  public setDataPath(dataPath: string): this {
    this.dataPath = dataPath;
    return this;
  }

  public getHeaders(): any {
    return this.headers;
  }
  public setHeaders(headers: any): this {
    this.headers = {
      ...this.getAuthHeader(),
      ...this.headers,
      ...headers,
    };
    return this;
  }

  public getMethod(): string {
    return this.method;
  }
  public setMethod(method?: string): this {
    this.method = method || "POST";
    return this;
  }

  public getScope(): any {
    return this.scope;
  }
  public setScope(scope: any): this {
    this.scope = scope;
    return this;
  }

  public getInsecure(): boolean {
    return !!this.insecure;
  }

  public setInsecure(insecure?: boolean): this {
    this.insecure = insecure || false;
    return this;
  }

  public getURL(): string | undefined {
    return this.url;
  }
  public setURL(url?: string): this {
    this.url = url;
    return this;
  }

  // FUNCTIONS
  public compile(...args: any) {
    return new interpolation().parse(...args);
  }

  public async request() {
    let axiosInstance = axios.create();
    if (this.getInsecure()) {
      axiosInstance = axios.create({
        httpsAgent: new https.Agent({
          rejectUnauthorized: false,
        }),
      });
    }

    return axiosInstance({
      data: this.compile(this.body, this.scope),
      headers: this.getHeaders(),
      method: this.getMethod(),
      url: this.compile(this.url),
    })
      .then(({ data }) => {
        if (get(this.getHeaders(), "Accept") === "application/xml") {
          return parser.toJson(data, { object: true });
        }
        return data;
      })
      .then((data) => {
        if (this.dataPath) {
          return this.searchDataPath(data, this.dataPath);
        }
        return data;
      });
  }

  searchDataPath = (data: any, path: string) => {
    try {
      const dataPath = path.split(".");
      let key;
      let currentData = data;
      while ((key = dataPath.shift())) {
        currentData = get(
          currentData,
          key === "*" ? `${key}.${dataPath.shift()}` : key
        );
      }
      if (currentData) {
        currentData = (
          Array.isArray(currentData) ? currentData : [currentData]
        ).map((currentData) =>
          Object.keys(currentData).reduce((acc: any, key: string) => {
            acc[key.toUpperCase()] = currentData[key];
            return acc;
          }, {})
        );
      }
      return currentData || "";
    } catch (e) {
      console.log(e);
    }
  };
}
