@echo off
set LD_LIBRARY_PATH=%CD%/assets/instantclient_21_3/ 
set INFORMIXDIR=%CD%/node_modules/informixdb/installer/onedb-odbc-driver
npx ts-node --pretty --logError --swc "%CD%\src\cli.ts" %*
