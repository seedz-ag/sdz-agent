import { Config } from "sdz-agent-types";
import WebSocketClient from "./src/websocket/client";
import ConfigJson from "./config";


require("dotenv").config();

(async () => {

  const ws = new WebSocketClient({ client_id: 1 }, await ConfigJson as Config);
  await ws.connect();
  // console.log(await ws.getConfig());
  ws.getSocket().emit("get-active-clients", function (data: any) {
    console.log(data);
  });
  ws.getSocket().emit(
    "execute-query",
    ws.getSocket().id,
    "SELECT * FROM clientes limit 2;"
  );
})();
