export const killProcess = async (exitCode = 1): Promise<void> => {
  process.exit(exitCode)
}
