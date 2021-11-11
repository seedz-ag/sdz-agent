import { Issuer } from "openid-client";

class OpenId {
  private issuer: Issuer;
  private client: any;
  constructor() {}
  async init() {
    const issuer = await Issuer.discover("https://accounts.google.com");
    const { Client } = issuer;
    const client = new Client({
      client_id: "<client_id>",
      client_secret: "<client_secret>",
      redirect_uris: ["http://localhost:3000/auth/callback"],
      response_types: ["code"],
    });
  }
}
