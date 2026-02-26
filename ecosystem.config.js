module.exports = {
  apps: [
    {
      name: "sdz-agent",
      cwd: "C:/sdz-agent/sdz-agent",
      script: "pm2-start.js",
      interpreter: "node",
      env: {
        USE_CONSOLE_LOG: "false",
        PM2_AGENT_CMD: "scheduler",
      },
    },
  ],
};
