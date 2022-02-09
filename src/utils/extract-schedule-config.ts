import { Config } from "sdz-agent-types";
import config from "../../config";

export default async () => ({
  ...{
    minute: "*",
    hour: "*",
    dayOfWeek: "*",
    dayOfMonth: "*",
    month: "*",
  },
  ...((await config as Config).schedule || {}),
});
