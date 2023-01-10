import "colors";

import ora from "ora";
import { prompt } from "enquirer";
import { writeFileSync } from  'fs';

(async () => {
  let spinner;
  const { clientId } = await prompt({
    type: "password",
    name: "clientId",
    message: `What is your Company ${"Cliend Id?".bold}`.green,
  }) as any;
  const { clientSecret } = await prompt({
    type: "password",
    name: "clientSecret",
    message: `What is your Company ${"Cliend Secret?".bold}`.green,
  }) as any;
  const { domain } = await prompt({
    type: "input",
    name: "domain",
    initial: "https://api.seedz.ag/",
    message: `What is your ${"Domain Address?".bold}`.green,
  }) as any;

  spinner = ora("CREATING .ENV").start()
  const dotEnv = [
    `CLIENT_ID='${clientId}'`,
    `CLIENT_SECRET='${clientId}'`,
    `DOMAIN='${domain}'`
  ]
  writeFileSync('.env', dotEnv.join("\r"))
  spinner.stop()

  // CONNECT AT WEBSOCKET
  const config: any = {};
  const imports: string[] = [];

  spinner = ora("CREATING CALLSTACK").start()
  switch(config?.database?.driver) {
    // INSTALL DB LIB
    // PUSH TO IMPORTS
    case 'mysql': 
      imports.push("import { Database } from  'DBLIB'")
      break;
  }

  // CREATE CALLSTACK
  const callstack = `import dotenv from 'dotenv'
  ${imports.join("\r")}
  const consumer = 
  const transport =

  while (let data = await consumer()) {
    await transport(data)
  }
`
  writeFileSync('index.ts', callstack)
  spinner.stop()
})();
