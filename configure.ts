import "colors";

import { prompt } from "enquirer";
import { writeFileSync } from  'fs'

(async () => {
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

  const dotEnv = `CLIENT_ID='${clientId}'
CLIENT_SECRET='${clientId}'
DOMAIN='${domain}'
`
  writeFileSync('.env', dotEnv)
})();
