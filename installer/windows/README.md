# Windows installer (MSI, WiX v5) - Go edition

Produces `artifacts/sdz-agent-<version>-win-x64.msi`.

## Build

```bash
# 1. cross-compile the Go binaries (any OS)
scripts/build.sh win-x64              # -> artifacts/publish/win-x64/sdz-agent.exe + sdz-agent-tray.exe

# 2. build the MSI (needs the .NET SDK only as the host of the WiX NuGet SDK; the agent is pure Go)
dotnet build installer/windows/Sdz.Agent.Installer.wixproj -c Release
dotnet build installer/windows/Sdz.Agent.Installer.wixproj -c Release -p:Version=3.0.1 -p:PublishDir=C:\path\to\publish\win-x64\
```

`$(Version)` defaults to the `VERSION` file at the repo root.

The product is registered as **"SDZ Agent (Go)"** with its own UpgradeCode, so it is
distinguishable from the .NET edition. Both editions register the same `SDZ-AGENT` service
and data dir: install only one of them on a machine.

**Build only on Windows.** WiX v5 is a .NET tool and restores on Linux/macOS, but
`wix.exe` aborts with "The WiX Toolset only supports Windows" before producing an
MSI (verified here: exit code 1, no diagnostics). The `release.yml` workflow builds
the MSI on `windows-latest`. WiX 6+ was deliberately not used: it is published under
the Open Source Maintenance Fee, which Seedz would need to assess before adopting.

## What the MSI does

| Step | Detail |
|---|---|
| Files | `sdz-agent.exe` (service, pure Go) + `sdz-agent-tray.exe` (tray app, Go + Fyne native window, built with cgo/MinGW) + `LICENSE.txt` → `C:\Program Files\SEEDZ\sdz-agent\` |
| Data dir | the install folder itself (`.env`, `output\`, `logs\`, `updates\` next to `sdz-agent.exe`), kept on uninstall; override with `SDZ_AGENT_DATA_DIR` |
| Legacy cleanup | fresh installs only: stops and deletes the NSSM-based `SDZ-AGENT` service of the Node agent (detected through `HKLM\SYSTEM\CurrentControlSet\Services\SDZ-AGENT\Parameters\Application`) |
| Configure | only when `CLIENT_ID` is given (wizard or command line): deferred, elevated `sdz-agent.exe configure --client-id … --client-secret … --api-url … --non-interactive`; exit code ≠ 0 rolls the install back (the `.env` written on a first install is removed by the rollback action). Without credentials the service is installed anyway and idles until configured through the tray app |
| Service | `SDZ-AGENT`, own process, auto start, LocalSystem, args `run`, restart on failure after 60 s (3 attempts, counter reset daily), depends on Tcpip; always started at the end |
| Tray app | Start Menu shortcut "SDZ Agent"; `HKLM\...\CurrentVersion\Run\SdzAgentTray` starts it for every user at login; the Finish page offers "Abrir o painel do SDZ Agent" (WixShellExec, non-elevated). It talks to the service over `\\.\pipe\sdz-agent-control` (Authenticated Users) |
| Upgrade | `MajorUpgrade` (same-version upgrades allowed, downgrade blocked); the Credentials page is skipped when a `.env` already exists |

## Wizard

Welcome → License → Install folder → **Credenciais** (Client ID, Client Secret, API URL — optional, both empty = configure later through the tray) → Ready → Progress → Finish (checkbox to open the tray panel).

## Silent / scripted install

```bat
msiexec /i sdz-agent-3.0.0-win-x64.msi /qn CLIENT_ID=xxxxx CLIENT_SECRET=yyyyy
msiexec /i sdz-agent-3.0.0-win-x64.msi /qn CLIENT_ID=xxxxx CLIENT_SECRET=yyyyy API_URL=https://api-snd.integration.seedz.ag/integration/v1/
msiexec /i sdz-agent-3.0.0-win-x64.msi /qn             :: no credentials: service idles until the tray app configures it
msiexec /i sdz-agent-3.0.1-win-x64.msi /qn             :: upgrade, keeps the existing .env
msiexec /x sdz-agent-3.0.0-win-x64.msi /qn             :: uninstall (data dir is kept)
msiexec /i ... /l*v install.log                        :: verbose log (CLIENT_SECRET is a hidden property, not logged)
```

## Signing

Unsigned MSIs trigger the SmartScreen "unrecognized app" prompt. Sign
`sdz-agent.exe` and `sdz-agent-tray.exe` (before building the MSI) and the MSI with an EV
code-signing certificate or Azure Trusted Signing:

```bat
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f cert.pfx /p %PFX_PASSWORD% artifacts\publish\win-x64\sdz-agent.exe artifacts\publish\win-x64\sdz-agent-tray.exe
dotnet build installer\windows\Sdz.Agent.Installer.wixproj -c Release
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f cert.pfx /p %PFX_PASSWORD% artifacts\sdz-agent-3.0.0-win-x64.msi
```

The release workflow performs these steps only when `WINDOWS_PFX_BASE64` and
`WINDOWS_PFX_PASSWORD` secrets are present.

## Assets

`banner.bmp` (493×58) and `dialog.bmp` (493×312) are generated placeholders; replace
them with Seedz branding (same sizes). `seedz.ico` is the Seedz icon (same as the tray).
The Go executables carry no icon/version resource unless `go-winres` is on PATH when
`scripts/build.sh` runs (see the script); the MSI shortcut and ARP entry use `seedz.ico` regardless.

## MSI gerado no Linux (msitools/wixl)

`scripts/build-msi-linux.sh` monta o MSI sem Windows, dentro do Docker (`debian + msitools + wixl`),
a partir de `installer/windows/wixl/sdz-agent.wxs` (esquema WiX 3, subconjunto do wixl). Instala os dois
executáveis, o serviço `SDZ-AGENT` (início automático, LocalSystem, `run`), a chave `Run` do tray, o atalho
no menu Iniciar, cria `output\` e `logs\` na própria pasta de instalação (mantidos na desinstalação) e suporta
upgrade pelo mesmo UpgradeCode. Diferenças em relação ao `Package.wxs` (WiX v5, só compila no Windows):

- sem a página de credenciais no wizard e sem a custom action `configure`: as credenciais entram pelo tray
  (abre sozinho no login) ou com `sdz-agent configure` num prompt elevado;
- sem a remoção automática do serviço NSSM `SDZ-AGENT` do agente Node: desinstale-o antes
  (`windows\node-windows-service\remove.bat` no agente antigo);
- sem a variável de ambiente `SDZ_AGENT_DATA_DIR` (o padrão do agente no Windows já é o mesmo diretório).

Uso: `scripts/publish.sh win-x64` (ou o cross-build do Go) e depois `scripts/build-msi-linux.sh`.

## Instalador com assistente (setup.exe, NSIS) — gerado no Linux

O MSI do wixl não tem páginas de diálogo. Para o instalador "next next next" com escolha do caminho use o
NSIS (`installer/windows/nsis/sdz-agent.nsi`), compilado no Linux via Docker (imagem `sdz-nsis`, criada
automaticamente pelo script):

```bash
scripts/build-setup-linux.sh            # usa artifacts/publish/win-x64 -> artifacts/sdz-agent-<versão>-win-x64-setup.exe
```

Páginas: Boas-vindas → Licença → **Pasta de instalação** (padrão `C:\Program Files\SEEDZ\sdz-agent`) →
Credenciais (opcional; valida com `sdz-agent.exe configure --non-interactive`) → Instalação → Concluir
(opção de abrir o painel). O instalador para/remove o serviço `SDZ-AGENT` anterior (inclusive o NSSM do agente Node),
registra o serviço com `sdz-agent.exe service install`, grava o tray em `HKLM\...\Run`, cria atalho no Menu Iniciar
e o desinstalador em Programas e Recursos. `.env`, `output\` e `logs\` ficam na pasta de instalação e são preservados na desinstalação.

Instalação silenciosa: `setup.exe /S /D=C:\Seedz\agent /CLIENTID=... /CLIENTSECRET=... /APIURL=...`
(`/D=` precisa ser o último parâmetro, sem aspas).

## Mesa (OpenGL por software) no pacote Go

`artifacts/publish/win-x64` precisa conter `opengl32.dll`, `libgallium_wgl.dll`, `dxil.dll` e
`MESA-LICENSE.txt` (gerados por `scripts/fetch-mesa.sh`, chamado pelos scripts de build). O NSIS e o
wixl instalam os quatro ao lado do tray e os removem na desinstalação. Sem eles o painel não abre em
VMs/RDP (Fyne exige OpenGL 2.0). Build do tray sem Windows: `scripts/build-win-docker.sh`.

