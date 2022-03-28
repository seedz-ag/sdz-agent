import WebSocketClient from "./src/websocket/client";
import OpenIdClient from "./src/open-id";

require("dotenv").config();
(async () => {
  const ws = WebSocketClient;
  OpenIdClient.addSubscriber(ws.setToken.bind(ws));
  await (await OpenIdClient.connect()).grant();
  // await OpenIdClient.refresh();
  await ws.watchConnection();
})();
