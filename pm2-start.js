const path = require("path");
const { spawn } = require("child_process");

const projectRoot = path.resolve(__dirname);
const node = process.execPath;
const tsNodeBin = path.join(projectRoot, "node_modules", "ts-node", "dist", "bin.js");
const command = process.env.PM2_AGENT_CMD || "listen";
const args = ["--swc", path.join(projectRoot, "src", "cli.ts"), command];

process.env.USE_CONSOLE_LOG = "true";
process.chdir(projectRoot);

const child = spawn(node, [tsNodeBin, ...args], {
  cwd: projectRoot,
  stdio: "inherit",
  env: process.env,
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  process.exit(code != null ? code : signal ? 1 : 0);
});

child.on("error", (err) => {
  console.error("[pm2-start] spawn error:", err);
  process.exit(1);
});
