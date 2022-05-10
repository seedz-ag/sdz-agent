import fs from "fs";

const cache:any = {};

export default (entity: string, data: any, exception = false) => {
    if (!cache[entity]) {
    cache[entity] = 0;
  }
  if(!exception){
    cache[entity]++;
  } 
  fs.writeFileSync(
    `${process.cwd()}/output/${entity}-${cache[entity]}.json`,
    JSON.stringify(data, null, 2)
  );
};
