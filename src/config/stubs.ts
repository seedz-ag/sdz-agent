import fs from "fs";

export default (
  erp: string,
  connector: string,
  driver: string,
  scope: string[]
) => {
  let dir = `${__dirname}/../../config/dto`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  dir = `${__dirname}/../../config/sql`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }

  for (const entity of scope) {
    const dto = entity.toLocaleLowerCase();
    const file = fs
      .readFileSync(
        `${__dirname}/../../node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/dto/${dto}.stub`
      )
      .toString();
    fs.writeFileSync(`${__dirname}/../../config/dto/${dto}.json`, file);
  }

  if ("database" === connector) {
    const files = fs.readdirSync(
      `${__dirname}/../../node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/sql/`
    );

    for (const file of files) {
      const sql = fs
        .readFileSync(
          `${__dirname}/../../node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/sql/${file}`
        )
        .toString();

      fs.writeFileSync(
        `${__dirname}/../../config/sql/${file.replace(".stub", "")}.sql`,
        sql
      );
    }
  }
};
