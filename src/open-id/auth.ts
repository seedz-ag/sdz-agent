import { Issuer } from "openid-client";
require ("dotenv").config();

export const openidClient = (async() => {
     const  issuer = await Issuer.discover(`${process.env.ISSUER_URL}`);
     return  new issuer.Client({
        client_id: `${process.env.CLIENT_ID}`,
        client_secret: `${process.env.CLIENT_SECRET}`,
      });
})();

