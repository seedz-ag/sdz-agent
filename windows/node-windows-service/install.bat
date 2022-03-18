@ECHO OFF

SET SERVICENAME=SDZ-AGENT
SET NSSM="%CD%\windows\node-windows-service\nssm\nssm.exe"
ECHO  %NSSM% stop %SERVICENAME%

ECHO INSTALLING SERVICE %SERVICENAME%

%NSSM% stop %SERVICENAME%
%NSSM% remove %SERVICENAME% confirm
%NSSM% install %SERVICENAME% %SERVICENAME%
%NSSM% set %SERVICENAME% Application %CD%\windows\node-windows-service\initializer.bat
%NSSM% set %SERVICENAME% AppDirectory %CD%
%NSSM% set %SERVICENAME% Description "Seedz Agent Windows Service"
%NSSM% set %SERVICENAME% Start SERVICE_AUTO_START
%NSSM% set %SERVICENAME% AppStopMethodSkip 0
%NSSM% set %SERVICENAME% AppStopMethodConsole 0
%NSSM% set %SERVICENAME% AppStopMethodWindow 0
%NSSM% set %SERVICENAME% AppStopMethodThreads 0
%NSSM% set %SERVICENAME% AppThrottle 0
%NSSM% set %SERVICENAME% AppExit Default Ignore
%NSSM% set %SERVICENAME% AppRestartDelay 0
%NSSM% set %SERVICENAME% AppStdout %CD%\windows\logs\%SERVICENAME%.log
%NSSM% set %SERVICENAME% AppStderr %CD%\windows\logs\%SERVICENAME%.log
%NSSM% set %SERVICENAME% AppStdoutCreationDisposition 4
%NSSM% set %SERVICENAME% AppStderrCreationDisposition 4
%NSSM% set %SERVICENAME% AppRotateFiles 1
%NSSM% set %SERVICENAME% AppRotateOnline 0
%NSSM% set %SERVICENAME% AppRotateSeconds 3600
%NSSM% set %SERVICENAME% AppRotateBytes 524288
