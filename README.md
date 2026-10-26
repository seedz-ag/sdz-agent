# sdz-agent (Go)

Porte em Go do **SDZ Agent**, o integrador on-premise da Seedz. Mesmas funcionalidades
do agente Node (`seedz-ag/sdz-agent` 2.x) e da edição .NET (`sdz-agent-dotnet`),
distribuído como **um binário estático por sistema operacional** mais o app de bandeja,
com instaladores nativos. Na máquina do cliente não existe Node, npm, git, compilador,
Instant Client, PM2 nem NSSM, e tampouco runtime Go.

| | Antes (Node 2.x) | Agora |
|---|---|---|
| Instalação Linux | script de ~30 comandos como root + supervisor | `apt install ./sdz-agent_x.y.z_amd64.deb` + credenciais pelo ícone da bandeja ou `sudo sdz-agent configure` |
| Instalação Windows | setup.exe + `pre.cmd` + reboot + `clone.cmd` + `.env` no Notepad + `services.msc` | MSI "Avançar, Avançar, Instalar"; credenciais no wizard ou depois pelo ícone da bandeja |
| Atualização | `git pull`, `npm i`, `killall node`… (12 passos) | `sdz-agent update` ou instalar a versão nova por cima |
| Reverter | `git checkout version/x` + `rm -rf node_modules` + `npm i` | instalar o pacote anterior |
| Oracle | Instant Client 76 MB + `LD_LIBRARY_PATH` | driver puro Go (`go-ora`) embutido |
| Tamanho | 361 MB de `node_modules` | agente ~15 MB, tray ~13 MB |

## Layout do repositório

```
cmd/sdz-agent/            CLI + serviço (um binário). Mapeamento do código Node:
internal/core/            environment.service, utils, logger, http-client, paths, dotenv
internal/api/             api.service + modelos de setting/discovery
internal/data/            database.adapter + drivers/ (mssql, mysql, postgres/redshift, mongodb, firebird, oracle, odbc[tag])
internal/consumers/       database/http/ftp consumers
internal/transports/      http/s3 transports
internal/services/        hydrator, interpolation, vpn, logs
internal/commands/        check, configure, execute(run), listen, scheduler, update
internal/telemetry/       telemetria de sistema/rede (outbox + envio em lote)
internal/hosting/         serviço Windows / systemd / launchd (kardianos/service), worker
internal/control/         canal de controle local (named pipe / unix socket), compartilhado com o tray
internal/update/          self-update (manifesto + instalador nativo)
cmd/sdz-agent-tray/       app de bandeja + painel nativo (Fyne; exige CGO/OpenGL para compilar)
installer/windows/        MSI (WiX v5)
installer/linux/          .deb/.rpm (nfpm), unit systemd, install.sh
installer/macos/          .pkg + LaunchDaemon
scripts/                  build.sh, package-linux.sh, make-manifest.sh
tests/docker/             bancos locais em Docker com dados fictícios para validar os drivers
.github/workflows/        ci.yml (vet+test+build), release.yml (tag v* -> instaladores + manifest.json)
```

## Instalação (fluxo final do cliente)

### Windows (Server 2016+ / Windows 10+)

1. Baixe `sdz-agent-<versão>-win-x64.msi` da página de releases.
2. Execute → Avançar → aceite a licença → pasta → **Client ID / Client Secret** (opcional) → Instalar.
3. O serviço **SDZ-AGENT** já fica em execução, com início automático e reinício em falha, e o
   ícone **SDZ Agent** aparece na bandeja. Se as credenciais ficaram em branco no wizard, clique no
   ícone → *Abrir painel…* e preencha ali.

Sem interação (rollout em massa; credenciais opcionais):

```bat
msiexec /i sdz-agent-3.0.0-win-x64.msi /qn CLIENT_ID=xxxxx CLIENT_SECRET=yyyyy
msiexec /i sdz-agent-3.0.0-win-x64.msi /qn                  :: instala e deixa o serviço aguardando credenciais
```

O MSI é registrado como "SDZ Agent (Go)". Ele e o MSI da edição .NET usam o mesmo serviço e
diretório de dados: instale apenas um dos dois.

### Linux (Ubuntu/Debian ou RHEL/Rocky/Amazon Linux, x86_64 ou arm64)

```bash
# uma linha (detecta deb/rpm e arquitetura)
curl -fsSL https://raw.githubusercontent.com/seedz-ag/sdz-agent-go/main/installer/linux/install.sh | sudo bash
sudo sdz-agent configure

# ou tudo de uma vez
curl -fsSL .../install.sh | sudo bash -s -- --client-id xxxxx --client-secret yyyyy

# ou manualmente
sudo apt install ./sdz-agent_3.0.0_amd64.deb      # Debian/Ubuntu
sudo dnf install ./sdz-agent-3.0.0-1.x86_64.rpm    # RHEL e derivados
sudo sdz-agent configure
```

O pacote instala `/opt/sdz-agent/sdz-agent`, o unit `sdz-agent.service` (habilitado e
iniciado), o app de bandeja `/opt/sdz-agent/sdz-agent-tray` (menu de aplicativos +
autostart em `/etc/xdg/autostart`) e o diretório de dados `/var/lib/sdz-agent`. O serviço
sobe logo na instalação e fica ocioso até receber as credenciais, pelo ícone da bandeja ou
por `sudo sdz-agent configure`. O binário é estático: nenhuma biblioteca de sistema é
necessária. `unixodbc` só entra (como recomendação) para o driver ODBC, presente apenas no
build `linux-x64` feito com `-tags odbc`.

Para o tray poder configurar o serviço sem senha de root, o usuário precisa estar no
grupo `sdz-agent` (o pacote adiciona quem rodou o `sudo apt install`; outros usuários:
`sudo usermod -aG sdz-agent <usuário>` e faça logout/login). No GNOME o ícone de bandeja
depende da extensão *AppIndicator and KStatusNotifierItem Support* (pacote
`gnome-shell-extension-appindicator`); KDE, XFCE, Cinnamon e MATE mostram o ícone
nativamente.

### Painel no Windows: OpenGL e o Mesa embutido

O tray/painel é feito com Fyne, que desenha por OpenGL 2.0. Máquinas virtuais e sessões de
área de trabalho remota (RDP) normalmente só expõem OpenGL 1.1, e nesse caso o Fyne não consegue
criar a janela e encerra o processo. Por isso o instalador Windows inclui o Mesa (OpenGL por
software: `opengl32.dll`, `libgallium_wgl.dll`, `dxil.dll`, licença MIT) na pasta do
`sdz-agent-tray.exe`; o Windows carrega a DLL da pasta do programa antes da do sistema, sem
alterar nada na máquina. `scripts/fetch-mesa.sh` baixa a versão fixada (sha256 conferido) de
github.com/pal1000/mesa-dist-win; `scripts/build.sh win-x64` e os scripts de MSI/setup chamam
ele automaticamente. O tray grava um log em `%LOCALAPPDATA%\SEEDZ\sdz-agent\tray.log` e, se
mesmo assim o OpenGL falhar, mostra uma caixa de mensagem nativa explicando e apontando para
`sdz-agent.exe credentials`.

### Credenciais pelo terminal (Linux, macOS e Windows)

Tudo que o ícone da bandeja faz com as credenciais também existe no terminal, no próprio binário:

```bash
sudo sdz-agent credentials set            # pergunta Client ID e Secret (sem eco) e valida na API
sudo sdz-agent credentials show           # client id, API URL, secret mascarado, auth, agendamentos
sudo sdz-agent credentials show --reveal  # mostra o secret inteiro
sudo sdz-agent credentials test           # valida na API; exit 0 = ok, 1 = inválidas, 2 = não configurado
sudo sdz-agent credentials clear          # remove; o serviço fica ocioso até um novo `set`
```

Para scripts, Ansible e instalação em lote, sem deixar o secret no histórico do shell nem no `ps`:

```bash
printf '%s\n' "$SECRET" | sudo sdz-agent credentials set --client-id ID --client-secret-stdin --non-interactive
SDZ_CLIENT_ID=ID SDZ_CLIENT_SECRET=SECRET sudo -E sdz-agent credentials set --non-interactive
SDZ_CLIENT_ID=ID SDZ_CLIENT_SECRET=SECRET curl -fsSL .../install.sh | sudo -E bash   # instala e configura
```

`set` e `clear` falam com o serviço pelo mesmo canal que o tray usa (`/run/sdz-agent/control.sock`):
as credenciais são validadas e gravadas pelo serviço, que recarrega a setting e os agendamentos
sem reiniciar, e usuários do grupo `sdz-agent` não precisam de `sudo`. Se o serviço não estiver
rodando, o comando grava `/var/lib/sdz-agent/.env` diretamente (aí precisa de root) e o serviço
lê o arquivo na próxima subida. O `.env` fica `0640 root:sdz-agent`. No Windows os mesmos
comandos funcionam no PowerShell como administrador (`sdz-agent.exe credentials ...`).

### macOS

Abra `sdz-agent-<versão>-osx-arm64.pkg` (ou `osx-x64`) → Continuar → Instalar, depois
`sudo sdz-agent configure` ou o ícone na barra de menus. Um LaunchDaemon
(`ag.seedz.sdz-agent`) mantém o agente rodando. Ver [installer/macos/README.md](installer/macos/README.md).

### Inicialização no boot (sem login)

O agente é um serviço do sistema e **não depende de ninguém logado**: no Windows é o serviço
`SDZ-AGENT` (conta LocalSystem, início *Automático (atraso)*, reinício automático em falha),
registrado pelo instalador; no Linux é o unit `sdz-agent.service` habilitado no
`multi-user.target`; no macOS um LaunchDaemon. Ao reiniciar um Windows Server ele volta sozinho,
lê as credenciais do `.env` na pasta de instalação (`C:\Program Files\SEEDZ\sdz-agent` por padrão), espera a rede ficar disponível
(a checagem de autenticação é repetida por cerca de 2 minutos antes de contar uma falha de start)
e carrega o agendamento da setting. O tray é só a interface: ele conversa com o serviço por um
named pipe local (`\\.\pipe\sdz-agent-control`), não por SMB nem por rede, e pode nem ser
aberto. Nada do funcionamento do agente passa por SMB.

### App de bandeja (Windows, Linux e macOS)

`sdz-agent-tray` roda na sessão do usuário (inicia no login) e conversa com o serviço por
um canal local: named pipe `\\.\pipe\sdz-agent-control` no Windows, socket
`/run/sdz-agent/control.sock` no Linux/macOS. Ícone com três estados (verde ativo, laranja
sem credenciais ou com erro, cinza serviço parado) e menu: *Abrir painel…*, *Executar
extração agora*, *Abrir pasta de logs*, *Limpar logs*, *Iniciar com o sistema*, *Sair*.

O painel é uma janela nativa (Fyne), igual ao tray .NET: status, credenciais com o olho para revelar o secret, executar agora, logs coloridos por nível, limpar logs. Para compilar o tray: Linux `gcc libgl1-mesa-dev xorg-dev`; Windows MinGW gcc (ou `gcc-mingw-w64-x86-64` para cross); macOS Xcode CLT. O agente continua sem CGO.
padrão: status, agendamentos, última/próxima extração, formulário de credenciais (Client ID,
Client Secret com botão de olho, API URL) validado na API e salvo pelo próprio serviço, e os
últimos 200 logs coloridos por nível com atualização automática. Só responde em 127.0.0.1 e
exige o token aleatório gerado a cada execução do tray. O protocolo do canal é o mesmo da
edição .NET, então o tray de uma edição fala com o serviço da outra.

### Exportar logs

No painel, o botão **Exportar** (no card de log) e o item **Exportar logs…** do menu da bandeja abrem a janela de salvar
(padrão: Documentos, `sdz-agent-logs-AAAAMMDD-HHMMSS.txt`) com todas as linhas de `logs/agent-*.log`, da mais antiga para a
mais nova (até 200 mil). No terminal: `sdz-agent logs export --output C:\temp\logs.txt`.

### Visual do painel

O painel segue o design system do sdz-nfe-agent (tokens copiados de `frontend/src/style.css`, tema escuro):
superfícies navy (`#040B1E`/`#081431`), verde Seedz `#34D579` no botão primário e no status, cards com borda
`#16244B` e raio 12, chaves em mono maiúsculo, console de log em `#02070F` com linhas coloridas por nível
(info azul, sucesso verde, aviso âmbar, erro vermelho), barra de status com "Iniciar com o sistema".
Implementado em `cmd/sdz-agent-tray/theme.go` (tema Fyne + componentes) e `window.go`; o logo é `assets/logo.png` (rasterizado do SVG do nfe-agent).

### Atualização remota (comando `Update`)

Pelo canal de comandos (`/commands`) a plataforma pode mandar o agente se atualizar. A mensagem segue o
formato dos outros comandos; o agente responde ao `sender` com `{"status","current","target","message"}`
**antes** de iniciar o instalador (que para o serviço e o sobe de novo já na versão nova).

| `arguments` | Efeito |
|---|---|
| `[]` | consulta o manifesto configurado; se houver versão mais nova, baixa, confere sha256 (e assinatura, se houver chave) e instala |
| `["check"]` | só informa: `available` ou `up-to-date` |
| `["3.1.0"]` ou `[{"version":"3.1.0"}]` | instala só se o manifesto oferecer exatamente essa versão (senão `rejected`) |
| `[{"force":true}]` | reinstala mesmo sem versão nova (reparo/downgrade) e mesmo com extração em andamento |
| `[{"manifestUrl":"https://..."}]` | usa outro manifesto (canário, versão específica); **só aceito com assinatura ativa** (`SDZ_AGENT_UPDATE_PUBKEY` ou chave embutida) |

```json
{"command":"Update","arguments":[{"version":"3.1.0"}],"destination":"<CLIENT_ID>","sender":"<canal>"}
```

`status` da resposta: `updating` (instalador iniciado), `available`, `up-to-date`, `rejected` (versão divergente, override
sem assinatura, outra atualização em curso, extração em andamento sem `force`) ou `error` (manifesto/download).
Se a versão nova não autenticar em 3 partidas seguidas, o agente reinstala a anterior (rollback já existente).

### Atualização

- Automática: o serviço consulta o `manifest.json` da release e aplica a versão nova.
- Manual: `sdz-agent update` ou instalar o pacote novo por cima (MSI/deb/rpm/pkg). O
  `.env` fica no diretório de dados e é preservado.

## CLI

```
sdz-agent run                      entrypoint do serviço (scheduler + listen), usado pelo SCM/systemd/launchd
sdz-agent scheduler                agenda as extrações conforme as Schedules da setting
sdz-agent listen                   escuta comandos da plataforma (/commands)
sdz-agent execute                  executa uma extração agora (= `run` do agente Node)
sdz-agent check <auth|datasource|dns|speed|all>
sdz-agent credentials set [--client-id ID] [--client-secret SECRET | --client-secret-stdin] [--api-url URL] [--non-interactive]
                                   informa/troca as credenciais: valida na API, grava o .env e o serviço recarrega na hora
sdz-agent credentials show [--reveal]   client id, API URL, secret mascarado (1025…1quh), auth, agendamentos
sdz-agent credentials test         valida as credenciais salvas na API (exit 0/1, para scripts)
sdz-agent credentials clear [--yes] remove as credenciais; o serviço fica ocioso até um novo set
sdz-agent configure                alias de `credentials set`
