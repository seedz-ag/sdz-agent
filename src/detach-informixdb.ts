import { readFileSync, writeFileSync } from "node:fs";

const sdzDatabaseFile = "node_modules/sdz-agent-database/dist/database.js";

try {
  console.log("SEARCHING DATABASE MODULE");

  let contents = readFileSync(sdzDatabaseFile).toString();

  console.log("DATABASE MODULE FOUND");

  console.log("DETACHING INFORMIXDB");

  contents = [
    'const sdz_agent_database_informix_1 = __importDefault(require("sdz-agent-database-informix"));\n',
    "            informix: sdz_agent_database_informix_1.default,\n",
  ].reduce((acc, curr) => acc.replace(curr, ""), contents);

  console.log("WRITING FILE");

  writeFileSync(sdzDatabaseFile, contents);

  console.log("FILE WRITTEN");
} catch (error) {}
