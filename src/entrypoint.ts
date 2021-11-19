require("dotenv").config();
import { appDynamics } from "sdz-agent-common";
const appd = appDynamics(require("appdynamics"));

import Caller from "./export/caller";

const express = require("express"),
  path = require("path"),
  http = require("http"),
  app = express();

app.set("port", process.env.PORT || 3000);

const caller = new Caller(require("../config").default, appd);

app.get("/init", async (req: any, res: any) => {
	const initTransaction = appd.startTransaction("[CALLER > INIT]");
	await caller.init();
	initTransaction.end();
	res.end();
});

app.get("/:entity", async (req: any, res: any) => {
	console.log(req.params.entity);
});

const server = http.createServer(app);
server.listen(app.get("port"), () => {
  console.log("Express server listening on port " + app.get("port"));
});
