@echo off
set LD_LIBRARY_PATH=%CD%/node_modules/sdz-agent-database-oracle/instantclient_21_3/ 
set INFORMIXDIR=%CD%/node_modules/informixdb/installer/onedb-odbc-driver
node "%~dp0\run" %*
