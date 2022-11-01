import UPL from "./upl/index";
import moment from "moment";

require("dotenv").config();

(async () => {
  const upl = new UPL({
    api: {
      url: `${process.env.API_URL}`,
    },
    ftp: {
      host: `${process.env.FTP_HOST}`,
      password: `${process.env.FTP_PASSWORD}`,
      port: `${process.env.FTP_PORT}` as unknown as number,
      username: `${process.env.FTP_USERNAME}`,
    },
    mongo: {
      identityDatabase: `${process.env.IDENTITY_DATABASE}`,
      url: `${process.env.MONGO_URL}`,
    },
    issuer: {
      url: `${process.env.ISSUER_URL}`,
    }
  });

  while (true) {
    await upl.process();
    await new Promise((resolve) => setTimeout(resolve, moment().add(1, 'hour').startOf('hour').diff(moment(), 'milliseconds')));
  }
})();
