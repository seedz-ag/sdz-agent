import { Socket } from "socket.io-client";

const express = require("express");
const socket = require("socket.io");

// App setup
const PORT = 8080;
const app = express();
const server = app.listen(PORT, function () {
  console.log(`Listening on port ${PORT}`);
  console.log(`http://localhost:${PORT}`);
});

// Static files
app.use(express.static("public"));

// Socket setup
const io = socket(server, { pingInterval: 1000 });

let list: any[] = [];

io.on("connection", function (socket: Socket) {
  socket.on("client-connect", function (client_id) {
    console.log("client-connect", client_id);
    (socket as any).client_id = client_id;
    list = [...list, { client_id, socket_id: socket.id }];
  });
  socket.on("disconnect", function () {
    console.log("client-disconnect");
    list = list.filter(item => item.client_id !== (socket as any).client_id);
  });
  socket.on("get-config", function (data, fn) {
    console.log("get-config", data);
    fn({});
  });
  socket.on("get-env", function (data) {
    console.log("get-env", data);
  });

  socket.on("get-active-clients", function (fn) {
    console.log("get-active-clients", list);
    fn(list);
  });

  socket.on("execute-query", function (socket_id, query) {
    io.sockets.sockets
      .get(socket_id)
      .emit(`execute-query`, query, function (cb: any) {
        console.log(cb);
      });
  });
});
