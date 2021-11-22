require("dotenv").config();

import { appDynamics } from "sdz-agent-common";
(global as any).appd = appDynamics(require("appdynamics"));
import callstack from "./callstack";
import Caller from "./export/caller";

const config = require("../config").default,
  express = require("express"),
  http = require("http"),
  app = express();

app.set("port", process.env.PORT || 3000);

const caller = new Caller(config);

app.get("/callstack", async (req: any, res: any) => {
  await callstack(config);
  res.end();
});

app.get("/init", async (req: any, res: any) => {
  const initTransaction = (global as any).appd?.startTransaction(
    "[CALLER > INIT]"
  );
  await caller.init();
  initTransaction.end();
  res.end();
});

app.get("/:entity", async (req: any, res: any) => {
  await caller.runOnce(req.params.entity);
  res.end();
});

const server = http.createServer(app);
server.listen(app.get("port"), () => {
  console.log("Express server listening on port " + app.get("port"));
});
