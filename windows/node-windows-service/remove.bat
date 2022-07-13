@ECHO OFF

SET SERVICENAME=SDZ-AGENT
SET NSSM="%CD%\windows\node-windows-service\nssm\nssm.exe"

ECHO REMOVING SERVICE %SERVICENAME%

%NSSM% stop %SERVICENAME%
%NSSM% remove %SERVICENAME% confirm
