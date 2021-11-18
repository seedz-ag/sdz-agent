require("dotenv").config();
import { appDynamics } from "sdz-agent-common";
const appd = appDynamics(require("appdynamics"));

import Process from "./process";

const express = require("express"),
  path = require("path"),
  http = require("http"),
  app = express();

app.set("port", process.env.PORT || 3000);

const p = new Process(require("../config"));

app.get("/init", async (req: any, res: any) => {
	const transaction = appd.startTransaction("/init [VALIDATE FTP]");
	await p.validateFTP();
	transaction.end();
	res.end();
});

app.get("/:entity", async (req: any, res: any) => {
	console.log(req.params.entity);
});

const server = http.createServer(app);
server.listen(app.get("port"), () => {
  console.log("Express server listening on port " + app.get("port"));
});
