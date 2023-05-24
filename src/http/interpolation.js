import Interpolator from "string-interpolation";
import moment from "moment";

const interpolator = new Interpolator({
  delimiter: ["{{", "}}", "{{ ", " }}"],
});

interpolator.registerModifier("moment", (val, data) => {
  const date = val.match(/(\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4})/) ? val : data.env[val];
  return moment(date, ["YYYY-MM-DD", "DD/MM/YYYY"]);
});
interpolator.registerModifier("subDay", (val, data) => {
  return moment(val).subtract(1, "d");
});
interpolator.registerModifier("DDMMYYYY", (val, data) => {
  return val.format("DDMMYYYY");
});
interpolator.registerModifier("DD/MM/YYYY", (val, data) => {
  return val.format("DD/MM/YYYY");
});
interpolator.registerModifier("YYYY-MM-DD", (val, data) => {
  return val.format("YYYY-MM-DD");
});
interpolator.registerModifier("YYYYMMDD", (val, data) => {
  return val.format("YYYYMMDD");
});
interpolator.registerModifier("date_sub_day", (val, data) => {
  return moment(new Date()).subtract(val, "day");
});
interpolator.registerModifier("date_sub_month", (val, data) => {
  return moment(new Date()).subtract(val, "month");
});

let page = 0;
export const setPage = (value) => page = value 
interpolator.registerModifier("page", (val, data) => {
  page = page + (val || 1) 
  return page
});

export default class {
  data = {
    now: moment(),
    tomorrow: moment().add(1, "d"),
    yesterday: moment().subtract(1, "d"),
  };
  parse(template, data) {
    return interpolator.parse(template, { ...this.data, ...data });
  }
};
