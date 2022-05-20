const { io } = require("socket.io-client");
require("dotenv").config();
(async () => {

const socket = io(`${process.env.WS_SERVER_URL}`, {
    path: "/integration/agentws",
    query: {
      token: '',
    },
    upgrade: false,
    timeout: 5000,
    transports: ["websocket"],
    });

    socket.on("connect", () => {
    console.log("Connected to SdzAgentWS");
    console.log(socket.id)

  })
  await socket.connect();
  await new Promise((resolve) => {
    console.log('pre emit')
    socket.emit("get-http-request", 'teste',(response) => {
    console.log(response)
    resolve()
    })
  });
})();

