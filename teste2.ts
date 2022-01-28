import { Config } from "sdz-agent-types";
import WebSocketClient from "./src/websocket/client";
import ConfigJson from "./config";


require("dotenv").config();
(async () => {
  const ws = WebSocketClient;
  await ws.connect({'name': process.env.CLIENT_ID, 'client_name':  process.env.CLIENT_NAME2, 'client_secret':  process.env.CLIENT_SECRET});
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
