import { exec } from 'child_process'
import ora from 'ora'

export const install = async (nodePackage: string): Promise<void> => {
  const searching = ora(`Checking ${nodePackage}.`)
  searching.start()
  try {
    await import(nodePackage)
  } catch (error) {
    const installing = ora(`Installing ${nodePackage}.`)
    installing.start()
    await new Promise(resolve => exec(`npm i ${nodePackage}`, resolve))
    installing.succeed()
  }
  searching.succeed(`${nodePackage} OK.`)
}
