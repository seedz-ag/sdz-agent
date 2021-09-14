import config from "../../config";

export default () => ({
  ...{
    minute: "*",
    hour: "*",
    dayOfWeek: "*",
    dayOfMonth: "*",
    month: "*",
  },
  ...(config.schedule || {}),
});
