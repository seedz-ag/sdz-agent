require("dotenv").config();

import { appDynamics } from "sdz-agent-common";
(global as any).appd = appDynamics(require("appdynamics"));

import Caller from "./export/caller";

const express = require("express"),
  path = require("path"),
  http = require("http"),
  app = express();

app.set("port", process.env.PORT || 3000);

const caller = new Caller(require("../config").default);

app.get("/init", async (req: any, res: any) => {
	const initTransaction = (global as any).appd?.startTransaction("[CALLER > INIT]");
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
