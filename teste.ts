import WebSocketClient from "./src/websocket/client";
import OpenIdClient from "./src/open-id";
import { from, Observable } from "rxjs";

require("dotenv").config();
(async () => {

  const ws = WebSocketClient;
  OpenIdClient.addSubscriber(ws.setToken.bind(ws));
  await (await OpenIdClient.connect()).grant();
  // await OpenIdClient.refresh();
  console.log("connect");
  await ws.connect();
  ws.getSocket().emit("sdz-response", "websocket_service", "ok")


})();
