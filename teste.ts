import { Issuer } from "openid-client";
import { Config } from "sdz-agent-types";
// import WebSocketClient from "./src/websocket/client";
import ConfigJson from "./config";

require("dotenv").config();
(async () => {
  const issuer = await Issuer.discover(
    "http://localhost:3001/oidc/.well-known/openid-configuration"
  );
  const client = new issuer.Client({
    client_id: "test",
    client_secret: "test_secret",
  });

  const { access_token } = await client.grant({
    grant_type: "client_credentials",
  });

  await client.introspect(String(access_token), undefined, {
    introspectBody: { extras: ['scopes', 'tenant-id']}
  });

  // const ws = WebSocketClient;
  // await ws.connect({
  //   client_id: process.env.CLIENT_ID,
  //   client_secret: process.env.CLIENT_SECRET,
  // });
  // ws.getSocket().emit("get-config", function (data: any) {
  //      console.log(data);
  //    });
  // console.log(await ws.getConfig());
  // ws.getSocket().emit("get-active-clients", function (data: any) {
  //   console.log(data);
  // });
  // ws.getSocket().emit(
  //   "run",
  //   ws.getSocket().id
  // );
  // ws.getSocket().emit(
  //   "execute-query",
  //   ws.getSocket().id,
  //   "SELECT * FROM clientes limit 2;"
  // );
})();
