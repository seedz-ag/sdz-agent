@echo off
set LD_LIBRARY_PATH=%CD%/assets/instantclient_21_3/ 
npx ts-node --pretty --logError --swc "%CD%\src\cli.ts" %*
