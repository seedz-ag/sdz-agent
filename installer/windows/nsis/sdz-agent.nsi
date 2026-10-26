; SDZ Agent - instalador "next next next" para Windows (NSIS 3, compila no Linux com makensis).
; Defines esperados (/D): VERSION, PRODUCT_NAME, PUBLISH_DIR, OUT_FILE, ICON_FILE, LICENSE_FILE, REG_KEY
Unicode true
!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "x64.nsh"

!ifndef VERSION
  !define VERSION "0.0.0"
!endif
!ifndef PRODUCT_NAME
  !define PRODUCT_NAME "SDZ Agent"
!endif
!ifndef REG_KEY
  !define REG_KEY "sdz-agent"
!endif
!define SERVICE_NAME "SDZ-AGENT"
!define UNINST_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${REG_KEY}"
!define DEFAULT_API_URL "https://api.integration.seedz.ag/integration/v1/"

Name "${PRODUCT_NAME} ${VERSION}"
OutFile "${OUT_FILE}"
InstallDir "$PROGRAMFILES64\SEEDZ\sdz-agent"
InstallDirRegKey HKLM "Software\SEEDZ\${REG_KEY}" "InstallDir"
RequestExecutionLevel admin
SetCompressor /SOLID lzma
BrandingText "Seedz"

VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${PRODUCT_NAME}"
VIAddVersionKey "CompanyName" "Seedz"
VIAddVersionKey "FileDescription" "Instalador do ${PRODUCT_NAME}"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" "Seedz"

Var ClientId
Var ClientSecret
Var ApiUrl
Var hClientId
Var hClientSecret
Var hApiUrl
Var ConfigureResult

!define MUI_ICON "${ICON_FILE}"
!define MUI_UNICON "${ICON_FILE}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${PRODUCT_NAME} ${VERSION}"
!define MUI_WELCOMEPAGE_TEXT "Este assistente instala o ${PRODUCT_NAME}, o integrador da Seedz, como serviço do Windows e deixa o ícone de controle na bandeja.$\r$\n$\r$\nClique em Avançar para continuar."
!define MUI_DIRECTORYPAGE_TEXT_TOP "O ${PRODUCT_NAME} será instalado na pasta abaixo. Tudo que o agente gera (credenciais, output e logs) fica nesta mesma pasta."
!define MUI_FINISHPAGE_RUN "$INSTDIR\sdz-agent-tray.exe"
!define MUI_FINISHPAGE_RUN_TEXT "Abrir o painel do ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_TEXT "O serviço ${SERVICE_NAME} foi instalado e iniciado. Se as credenciais não foram informadas, use o painel (ícone na bandeja) para configurá-las."

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${LICENSE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
Page custom CredentialsPage CredentialsPageLeave
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "PortugueseBR"
!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_ICONSTOP "Este instalador requer Windows 64 bits."
    Abort
  ${EndIf}
  SetRegView 64
  ; parâmetros para instalação silenciosa: /S /CLIENTID=x /CLIENTSECRET=y /APIURL=z
  ${GetParameters} $0
  ${GetOptions} $0 "/CLIENTID=" $ClientId
  ${GetOptions} $0 "/CLIENTSECRET=" $ClientSecret
  ${GetOptions} $0 "/APIURL=" $ApiUrl
  ${If} $ApiUrl == ""
    StrCpy $ApiUrl "${DEFAULT_API_URL}"
  ${EndIf}
FunctionEnd

Function CredentialsPage
  !insertmacro MUI_HEADER_TEXT "Credenciais" "Informe o Client ID e o Client Secret fornecidos pela Seedz (opcional: podem ser preenchidos depois pelo ícone da bandeja)."
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 12u "Client ID"
  Pop $0
  ${NSD_CreateText} 0 13u 100% 13u "$ClientId"
  Pop $hClientId
  ${NSD_CreateLabel} 0 32u 100% 12u "Client Secret"
  Pop $0
  ${NSD_CreatePassword} 0 45u 100% 13u "$ClientSecret"
  Pop $hClientSecret
  ${NSD_CreateLabel} 0 64u 100% 12u "API URL"
  Pop $0
  ${NSD_CreateText} 0 77u 100% 13u "$ApiUrl"
  Pop $hApiUrl
  ${NSD_CreateLabel} 0 100u 100% 24u "As credenciais são validadas na API da Seedz durante a instalação. Deixe em branco para configurar depois pelo painel."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function CredentialsPageLeave
  ${NSD_GetText} $hClientId $ClientId
  ${NSD_GetText} $hClientSecret $ClientSecret
  ${NSD_GetText} $hApiUrl $ApiUrl
  ${If} $ClientId != ""
  ${AndIf} $ClientSecret == ""
    MessageBox MB_ICONEXCLAMATION "Informe o Client Secret ou deixe os dois campos em branco."
    Abort
  ${EndIf}
  ${If} $ClientId == ""
  ${AndIf} $ClientSecret != ""
    MessageBox MB_ICONEXCLAMATION "Informe o Client ID ou deixe os dois campos em branco."
    Abort
  ${EndIf}
FunctionEnd

Section "Install"
  SetRegView 64
  SetShellVarContext all
  SetOutPath "$INSTDIR"

  ; para o serviço e o tray de uma versão anterior (inclusive o serviço NSSM do agente Node, mesmo nome)
  DetailPrint "Parando o serviço ${SERVICE_NAME} (se existir)..."
  nsExec::ExecToLog 'sc.exe stop ${SERVICE_NAME}'
  Pop $0
  nsExec::ExecToLog 'taskkill.exe /IM sdz-agent-tray.exe /F'
  Pop $0
  ; wait (up to 60 s) until the service process is really gone, so sdz-agent.exe can be replaced.
  ; On a self-update this setup was started by the service itself and survives its stop.
  nsExec::ExecToLog 'cmd.exe /c "for /l %i in (1,1,60) do (sc.exe query ${SERVICE_NAME} | find "RUNNING" >nul || sc.exe query ${SERVICE_NAME} | find "STOP_PENDING" >nul || exit /b 0) & timeout /t 1 /nobreak >nul"'
  Pop $0
  nsExec::ExecToLog 'taskkill.exe /IM sdz-agent.exe /F'
  Pop $0
  Sleep 1000
  nsExec::ExecToLog 'sc.exe delete ${SERVICE_NAME}'
  Pop $0

  File "${PUBLISH_DIR}\sdz-agent.exe"
  File "${PUBLISH_DIR}\sdz-agent-tray.exe"
  File "/oname=LICENSE.txt" "${LICENSE_FILE}"

  CreateDirectory "$INSTDIR\output"
  CreateDirectory "$INSTDIR\logs"

  ${If} $ClientId != ""
    DetailPrint "Validando credenciais na API..."
    nsExec::ExecToLog '"$INSTDIR\sdz-agent.exe" configure --client-id "$ClientId" --client-secret "$ClientSecret" --api-url "$ApiUrl" --non-interactive'
    Pop $ConfigureResult
    ${If} $ConfigureResult != 0
      MessageBox MB_ICONEXCLAMATION "As credenciais não foram aceitas pela API (código $ConfigureResult). A instalação continua; configure-as depois pelo ícone da bandeja."
    ${EndIf}
  ${EndIf}

  DetailPrint "Registrando e iniciando o serviço ${SERVICE_NAME}..."
  nsExec::ExecToLog '"$INSTDIR\sdz-agent.exe" service install'
  Pop $0
  ${If} $0 != 0
    MessageBox MB_ICONEXCLAMATION "Não foi possível registrar o serviço (código $0). Execute depois, como administrador: sdz-agent.exe service install"
  ${EndIf}

  WriteRegStr HKLM "Software\SEEDZ\${REG_KEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKLM "Software\SEEDZ\${REG_KEY}" "Version" "${VERSION}"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SdzAgentTray" '"$INSTDIR\sdz-agent-tray.exe"'

  CreateDirectory "$SMPROGRAMS\SDZ Agent"
  CreateShortcut "$SMPROGRAMS\SDZ Agent\${PRODUCT_NAME}.lnk" "$INSTDIR\sdz-agent-tray.exe" "" "$INSTDIR\sdz-agent-tray.exe" 0
  CreateShortcut "$SMPROGRAMS\SDZ Agent\Desinstalar ${PRODUCT_NAME}.lnk" "$INSTDIR\uninstall.exe"

  WriteUninstaller "$INSTDIR\uninstall.exe"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayName" "${PRODUCT_NAME}"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKLM "${UNINST_KEY}" "Publisher" "Seedz"
  WriteRegStr HKLM "${UNINST_KEY}" "DisplayIcon" "$INSTDIR\sdz-agent-tray.exe"
  WriteRegStr HKLM "${UNINST_KEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKLM "${UNINST_KEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegStr HKLM "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoModify" 1
  WriteRegDWORD HKLM "${UNINST_KEY}" "NoRepair" 1
  ${GetSize} "$INSTDIR" "/S=0K" $0 $1 $2
  IntFmt $0 "0x%08X" $0
  WriteRegDWORD HKLM "${UNINST_KEY}" "EstimatedSize" "$0"
SectionEnd

Section "Uninstall"
  SetRegView 64
  SetShellVarContext all
  nsExec::ExecToLog 'taskkill.exe /IM sdz-agent-tray.exe /F'
  Pop $0
  nsExec::ExecToLog '"$INSTDIR\sdz-agent.exe" service uninstall'
  Pop $0
  nsExec::ExecToLog 'sc.exe delete ${SERVICE_NAME}'
  Pop $0
  Delete "$INSTDIR\sdz-agent.exe"
  Delete "$INSTDIR\sdz-agent-tray.exe"
  Delete "$INSTDIR\LICENSE.txt"
  Delete "$INSTDIR\uninstall.exe"
  RMDir "$INSTDIR"
  RMDir "$PROGRAMFILES64\SEEDZ"
  Delete "$SMPROGRAMS\SDZ Agent\${PRODUCT_NAME}.lnk"
  Delete "$SMPROGRAMS\SDZ Agent\Desinstalar ${PRODUCT_NAME}.lnk"
  RMDir "$SMPROGRAMS\SDZ Agent"
  DeleteRegValue HKLM "Software\Microsoft\Windows\CurrentVersion\Run" "SdzAgentTray"
  DeleteRegKey HKLM "${UNINST_KEY}"
  DeleteRegKey HKLM "Software\SEEDZ\${REG_KEY}"
  ; .env, output\ e logs\ dentro de $INSTDIR são mantidos de propósito (RMDir só remove a pasta se estiver vazia)
SectionEnd
