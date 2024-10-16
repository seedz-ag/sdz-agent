const { Readable } = require("stream");

const url =
  "https://docs.google.com/spreadsheets/d/175gVE7HagucJDMG7FUJZrNqYRCIYACfT4Cc0umJQREg/gviz/tq?tqx=out:csv&sheet=invoice";
const axios = require("axios").default;

const csv = require("fast-csv");

(() => {
    axios.get(url).then((response) => {
        this.entries = response.data;
        

        console.log(response.data.split("\n"));

        const stream = Readable.from(response.data.split("\n"));

        const result = [];

        new Promise(resolve => {

        stream
        .pipe(
          csv.parse({
            headers: true,
            delimiter: ","
          })
        )
        .on("data", (row) => {
          console.log(row)
          result.push(row);
        })
        .on("end", () => resolve(result))
        .on("error", (error) => {
          this.loggerAdapter.log("error", error);
        });


        }).then(console.log);
      });
})


()