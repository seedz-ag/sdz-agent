import { Client, Issuer, TokenSet } from "openid-client";
import moment from "moment";
export class OpenIdClient {
  private clientId: string;
  private clientSecret: string;
  private issuerURL: string;
  private openIdClient: Client;
  private timeout: NodeJS.Timeout;
  private token: TokenSet;
  private subscriber: any = [];

  constructor(issuerURL: string, clientId: string, clientSecret: string) {
    this.setClientId(clientId);
    this.setClientSecret(clientSecret);
    this.setIssuerURL(issuerURL);
  }
  public addSubscriber(subscriber: any): this {
    this.subscriber.push(subscriber);
    return this;
  }
  // GETTERS AND SETTERS
  public getClientId(): string {
    return this.clientId;
  }
  public getClientSecret(): string {
    return this.clientSecret;
  }
  public getIssuerURL(): string {
    return this.issuerURL;
  }
  public getOpenIdClient(): Client {
    return this.openIdClient;
  }
  public getToken(): TokenSet {
    return this.token;
  }
  public setClientId(clientId: string): this {
    this.clientId = clientId;
    return this;
  }
  public setClientSecret(clientSecret: string): this {
    this.clientSecret = clientSecret;
    return this;
  }
  public setIssuerURL(issuerURL: string): this {
    this.issuerURL = issuerURL;
    return this;
  }
  public setOpenIdClient(client: Client): this {
    this.openIdClient = client;
    return this;
  }
  public setToken(token: TokenSet): this {
    this.token = token;
    return this;
  }

  //FUNCTIONS
  public async connect(): Promise<this> {
    const issuer = await Issuer.discover(this.getIssuerURL());
    this.setOpenIdClient(
      new issuer.Client({
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
      })
    );
    return this;
  }

  public async grant(): Promise<this> {
    const response = await this.getOpenIdClient().grant({
      grant_type: "client_credentials",
    });
    this.setToken(response);
    this.subscriber.forEach((subscriber: any) => {
      subscriber(this.getToken().access_token)
    });
    await this.refresh();
    return this;
  }

  public async refresh(): Promise<this> {
    clearTimeout(this.timeout);
    this.timeout = setTimeout(this.grant.bind(this), moment(this.getToken().expires_at, 'X').diff(moment(), 'seconds') * 999);
    return this;
  }
}