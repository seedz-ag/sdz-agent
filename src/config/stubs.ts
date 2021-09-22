import fs from "fs";

export default (
  dtoType: string,
  connector: string,
  driver: string,
  scope: string[]
) => {
  for (const entity of scope) {
    const dto = entity.toLocaleLowerCase();
    const file = fs
      .readFileSync(
        `${__dirname}/../../node_modules/sdz-agent-${connector}-${driver}/src/stubs/dto/${dto}.stub`
      )
      .toString();
    fs.writeFileSync(`${__dirname}/../../config/dto/${dto}.json`, file);
  }
};
