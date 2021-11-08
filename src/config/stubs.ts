import fs from "fs";

export default (
  erp: string,
  connector: string,
  driver: string,
  scope: string[]
) => {
  const baseDir = process.env.CONFIGDIR || `${process.cwd()}/config`;
  
  if(!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, {recursive: true});	
  }

  const sqlDir = `${baseDir}/sql`;
  if (!fs.existsSync(sqlDir)) {
    fs.mkdirSync(sqlDir);
  }

  const dtoDir = `${baseDir}/dto`;
  if (!fs.existsSync(dtoDir)) {
    fs.mkdirSync(dtoDir);
  }

  for (const entity of scope) {
    const dto = entity.toLocaleLowerCase();
    const file = fs
      .readFileSync(
        `${process.cwd()}/node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/dto/${dto}.stub`
      )
      .toString();
    fs.writeFileSync(`${dtoDir}/${dto}.json`, file);
  }

  if ("database" === connector) {
    const files = fs.readdirSync(
      `${process.cwd()}/node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/sql/`
    );

    for (const file of files) {
      const sql = fs
        .readFileSync(
          `${process.cwd()}/node_modules/sdz-agent-${connector}-${driver}/src/${erp}/stubs/sql/${file}`
        )
        .toString();

      fs.writeFileSync(
        `${sqlDir}/${file.replace(".stub", "")}.sql`,
        sql
      );
    }
  }
};
