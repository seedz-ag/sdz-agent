import { XMLParser } from "fast-xml-parser";
import axios from "axios";
import { get } from "dot-wild";
import interpolation from "./interpolation";

export default class HttpClient {
  private authHeader?: any;
  private body?: string;
  private dataPath?: string;
  private headers: any;
  private scope?: any;
  private url?: string;

  public constructor(url?: string, headers?: any, scope?: any, body?: string) {
    this.setBody(body);
    this.setHeaders(headers);
    this.setScope(scope);
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

  public getScope(): any {
    return this.scope;
  }
  public setScope(scope: any): this {
    this.scope = scope;
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
  public compile() {
    return interpolation.parse(this.body, this.scope);
  }

  public request() {
    return axios({
      data: this.compile(),
      headers: this.getHeaders(),
      method: "post",
      url: this.getURL(),
    })
      .then(({ data }) => {
        if (get(this.getHeaders(), "Accept") === "application/xml") {
          return new XMLParser().parse(data);
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

  public searchDataPath(data: any, path: string) {
    const dataPath = path.split(".");
    let currentData = data;
    for (let i = 0; i < dataPath.length; i++) {
      currentData = Object.keys(currentData).reduce((acc: any, key: string) => {
        acc[key.toUpperCase()] = currentData[key];
        return acc;
      }, {});
      currentData = get(currentData, dataPath[i].toUpperCase());
    }
    return currentData;
  }
}
