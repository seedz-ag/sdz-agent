import DatabaseDrivers from "sdz-agent-types/dist/enums/database_drivers.enum";
import Superacao from "./superacao/index";

require("dotenv").config();

(async () => {
  const superacao = new Superacao({
    api: {
      password: `${process.env.SUPERACAO_API_PASSWORD}`,
      url: `${process.env.SUPERACAO_API_URL}`,
      username: `${process.env.SUPERACAO_API_USERNAME}`,
    },
    database: {
      driver: `${process.env.SUPERACAO_DATABASE_DRIVER}` as DatabaseDrivers,
      host: `${process.env.SUPERACAO_DATABASE_HOST}`,
      schema: `${process.env.SUPERACAO_DATABASE_SCHEMA}`,
      password: `${process.env.SUPERACAO_DATABASE_PASSWORD}`,
      port: `${process.env.SUPERACAO_DATABASE_PORT}` as unknown as number,
      server: `${process.env.SUPERACAO_DATABASE_SERVER}`,
      username: `${process.env.SUPERACAO_DATABASE_USERNAME}`,
    },
    ftp: {
      host: `${process.env.SUPERACAO_FTP_HOST}`,
      password: `${process.env.SUPERACAO_FTP_PASSWORD}`,
      port: `${process.env.SUPERACAO_FTP_PORT}` as unknown as number,
      username: `${process.env.SUPERACAO_FTP_USERNAME}`,
    },
    issuerUrl: `${process.env.ISSUER_URL}`,
    legacy: "TRUE" === `${`${process.env.SUPERACAO_LEGACY}`.toUpperCase()}`,
  });

  await superacao.process();

  process.exitCode = 0;
  process.exit();
})();
