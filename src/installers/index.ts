import { exec } from "child_process";
import ora from "ora";

export const install = async (nodePackage: string) => {
  const searching = ora(`Checking ${nodePackage}.`);
  searching.start();
  try {
    const module = await import(nodePackage);
  } catch (error) {
    const installing = ora(`Installing ${nodePackage}.`);
    installing.start();
    await new Promise(resolve => exec(`npm i ${nodePackage}`, resolve));
    installing.succeed();
  }
  searching.succeed(`${nodePackage} OK.`);
  return import(nodePackage);
};
