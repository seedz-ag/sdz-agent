# sdz-agent (.NET)

Reescrita em .NET do **SDZ Agent**, o integrador on-premise da Seedz. Mesmas
funcionalidades do agente Node (`seedz-ag/sdz-agent` 2.x), distribuído como **um
binário auto-contido por sistema operacional** e instaladores nativos. Na máquina
do cliente não existe Node, npm, git, compilador, Instant Client, PM2 nem NSSM.

| | Antes (Node 2.x) | Agora |
|---|---|---|
| Instalação Linux | script de ~30 comandos como root + supervisor | `apt install ./sdz-agent_x.y.z_amd64.deb` + `sudo sdz-agent configure` |
| Instalação Windows | setup.exe + `pre.cmd` + reboot + `clone.cmd` + `.env` no Notepad + `services.msc` | MSI "Avançar, Avançar, Instalar"; credenciais no wizard ou depois pelo ícone da bandeja |
| Atualização | `git pull`, `npm i`, `killall node`… (12 passos) | `sdz-agent update` ou instalar a versão nova por cima |
| Reverter | `git checkout version/x` + `rm -rf node_modules` + `npm i` | instalar o pacote anterior |
| Oracle | Instant Client 76 MB + `LD_LIBRARY_PATH` | driver managed embutido |

## Layout do repositório

```
src/Sdz.Agent/            aplicação (CLI + serviço). Mapeamento do código Node:
  Core/                   environment.service, utils, logger, http-client
  Api/                    api.service + interfaces de setting/discovery
  Data/                   database.adapter + Drivers/ (mssql, mysql, postgres/redshift, mongodb, firebird, oracle, odbc)
  Consumers/              database/http/ftp consumers
  Transports/             http/s3 transports
  Services/               hydrator, interpolation, vpn, logs
  Commands/               check, configure, execute(run), listen, scheduler, update
  Telemetry/              telemetria de sistema/rede (outbox + envio em lote)
  Hosting/                serviço Windows / systemd / launchd, install/uninstall, canal de controle local
  Update/                 self-update (manifesto assinado + instalador nativo)
src/Sdz.Agent.Control/    protocolo do canal de controle (named pipe / unix socket) compartilhado com o tray
src/Sdz.Agent.Tray/       app de bandeja (Avalonia): status, credenciais, "executar agora", logs
tests/Sdz.Agent.Tests/    xunit
installer/windows/        MSI (WiX v5)
installer/linux/          .deb/.rpm (nfpm), unit systemd, install.sh
installer/macos/          .pkg + LaunchDaemon
scripts/                  publish.sh, package-linux.sh, make-manifest.sh
.github/workflows/        ci.yml (build+test), release.yml (tag v* -> instaladores + manifest.json)
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

### Linux (Ubuntu/Debian ou RHEL/Rocky/Amazon Linux, x86_64 ou arm64)

```bash
# uma linha (detecta deb/rpm e arquitetura)
curl -fsSL https://raw.githubusercontent.com/seedz-ag/sdz-agent-dotnet/main/installer/linux/install.sh | sudo bash
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
por `sudo sdz-agent configure`.

Para o tray poder configurar o serviço sem senha de root, o usuário precisa estar no
grupo `sdz-agent` (o pacote adiciona quem rodou o `sudo apt install`; outros usuários:
`sudo usermod -aG sdz-agent <usuário>` e faça logout/login). No GNOME o ícone de bandeja
depende da extensão *AppIndicator and KStatusNotifierItem Support* (pacote
`gnome-shell-extension-appindicator`); KDE, XFCE, Cinnamon e MATE mostram o ícone
nativamente.

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
`sudo sdz-agent configure`. Um LaunchDaemon (`ag.seedz.sdz-agent`) mantém o agente rodando.

### Inicialização no boot (sem login)

O agente é um serviço do sistema e **não depende de ninguém logado**: no Windows é o serviço
`SDZ-AGENT` (conta LocalSystem, início *Automático (atraso)*, política de reinício a cada 60 s em
falha), registrado pelo instalador; no Linux é o unit `sdz-agent.service` habilitado no
`multi-user.target`; no macOS um LaunchDaemon. Ao reiniciar um Windows Server ele volta sozinho,
lê as credenciais do `.env` na pasta de instalação (`C:\Program Files\SEEDZ\sdz-agent` por padrão), espera a rede ficar disponível
(a checagem de autenticação é repetida por cerca de 2 minutos antes de contar uma falha de start)
e carrega o agendamento da setting. O tray é só a interface: ele conversa com o serviço por um
named pipe local (`\\.\pipe\sdz-agent-control`), não por SMB nem por rede, e pode nem ser
aberto. Nada do funcionamento do agente passa por SMB.

### App de bandeja (Windows e Linux)

`sdz-agent-tray` roda na sessão do usuário (inicia no login) e conversa com o serviço por
um canal local: named pipe `\\.\pipe\sdz-agent-control` no Windows, socket
`/run/sdz-agent/control.sock` no Linux. Ele mostra o estado (ativo, extração em andamento,
sem credenciais, erro), permite **informar/trocar as credenciais** (validadas na API e
salvas pelo próprio serviço, sem precisar de administrador), **executar uma extração
agora**, ver os últimos logs e ligar/desligar "Iniciar com o sistema". Nada no tray é
necessário para o serviço funcionar: ele continua rodando sem ninguém logado.

### Exportar logs

No painel, o botão **Exportar** (no card de log) e o item **Exportar logs…** do menu da bandeja abrem a janela de salvar
(padrão: Documentos, `sdz-agent-logs-AAAAMMDD-HHMMSS.txt`) com todas as linhas de `logs/agent-*.log`, da mais antiga para a
mais nova (até 200 mil). No terminal: `sdz-agent logs export --output C:\temp\logs.txt`.

### Visual do painel

O painel segue o design system do sdz-nfe-agent (tokens copiados de `frontend/src/style.css`, tema escuro):
superfícies navy (`#040B1E`/`#081431`), verde Seedz `#34D579` no botão primário e no status, cards com borda
`#16244B` e raio 12, chaves em mono maiúsculo, console de log em `#02070F` com linhas coloridas por nível
(info azul, sucesso verde, aviso âmbar, erro vermelho), barra de status com "Iniciar com o sistema".
Implementado em `src/Sdz.Agent.Tray/Seedz.cs` (tokens e componentes) + `App.axaml` (estilos Fluent sobrescritos) + `MainWindow.cs`.

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

- Automática: o serviço consulta o `manifest.json` da release e aplica a versão nova
  (ver *Self-update* abaixo).
- Manual: `sdz-agent update` ou instalar o pacote novo por cima (MSI/deb/rpm/pkg). O
  `.env` fica no diretório de dados e é preservado.

## CLI

```
sdz-agent run                      entrypoint do serviço (scheduler + listen), usado pelo SCM/systemd/launchd
sdz-agent scheduler                agenda as extrações conforme as Schedules da setting
sdz-agent listen [--session-ttl N] escuta comandos da plataforma (/commands); com --session-ttl encerra após N min sem comando efetivo (Ping não conta)
sdz-agent execute                  executa uma extração agora (= `run` do agente Node)
sdz-agent check <auth|datasource|dns|speed|all>
sdz-agent credentials set [--client-id ID] [--client-secret SECRET | --client-secret-stdin] [--api-url URL] [--non-interactive]
                                   informa/troca as credenciais: valida na API, grava o .env e o serviço recarrega na hora
sdz-agent credentials show [--reveal]   client id, API URL, secret mascarado (1025…1quh), auth, agendamentos
sdz-agent credentials test         valida as credenciais salvas na API (exit 0/1, para scripts)
sdz-agent credentials clear [--yes] remove as credenciais; o serviço fica ocioso até um novo set
sdz-agent configure                alias de `credentials set`
sdz-agent update [--check]         self-update (ou só verifica se há versão nova)
sdz-agent service <install|uninstall|start|stop|restart|status>
sdz-agent logs export [--output ARQ] grava todos os logs (logs/agent-*.log) num .txt; sem permissão de leitura, pede ao serviço
sdz-agent status                   estado ao vivo do serviço (credenciais, auth, agendamentos, última/próxima extração)
sdz-agent version
```

Opções de extração (`execute`): `--schema`, `--query`, `--extract-last-n-days`,
`--raw-only`, `--env DEV|SND|PRD`, `--use-console-log`, como no agente Node.

## Diretório de dados

Guarda `.env`, `output/` (arquivos temporários da extração) e `logs/`. Resolução, nesta ordem:

1. variável de ambiente `SDZ_AGENT_DATA_DIR` (os instaladores definem esta);
2. o diretório atual, se contiver um `.env` (layout de desenvolvimento / legado);
3. padrão da plataforma: a própria pasta de instalação (Windows), `/var/lib/sdz-agent`
   (Linux/macOS, quando root), senão `~/.sdz-agent`.

`.env` mínimo:

```
API_URL=https://api.integration.seedz.ag/integration/v1/
CLIENT_ID=...
CLIENT_SECRET=...
```

## Desenvolvimento

Requisitos: .NET SDK 10 (`global.json`). Sem dependências nativas.

```bash
dotnet build
dotnet test
dotnet run --project src/Sdz.Agent -- check auth     # usa o .env do diretório atual
```

## Build dos instaladores

```bash
scripts/publish.sh                           # todos os RIDs -> artifacts/publish/<rid>/
scripts/publish.sh linux-x64 win-x64         # só alguns

scripts/package-linux.sh linux-x64           # .deb + .rpm (precisa do nfpm)
scripts/package-linux.sh linux-arm64
dotnet build installer/windows/Sdz.Agent.Installer.wixproj -c Release   # MSI (somente no Windows)
installer/macos/build-pkg.sh osx-arm64       # .pkg (somente no macOS)

scripts/make-manifest.sh                     # artifacts/manifest.json com sha256 de cada pacote
```

A versão vem de `<Version>` em `Directory.Build.props`. Para publicar: altere a versão,
crie a tag `vX.Y.Z` e faça push; o workflow `release.yml` gera todos os pacotes e
anexa à GitHub Release junto com `manifest.json`, `SHA256SUMS.txt` e `install.sh`.

Detalhes por plataforma: [installer/windows/README.md](installer/windows/README.md),
[installer/macos/README.md](installer/macos/README.md), [installer/linux/nfpm.yaml](installer/linux/nfpm.yaml).

## Self-update

1. O serviço lê periodicamente (e ao receber o comando `Update` pelo canal `listen`)
   o `manifest.json` da release:
   ```json
   { "version": "3.0.1", "channel": "stable", "publishedAt": "...",
     "packages": { "win-x64": { "url": "...msi", "sha256": "..." },
                   "linux-x64-deb": { ... }, "linux-x64-rpm": { ... },
                   "linux-arm64-deb": { ... }, "linux-arm64-rpm": { ... },
                   "osx-x64": { ... }, "osx-arm64": { ... } } }
   ```
2. Baixa o pacote da própria plataforma para `<dados>/updates/`, confere o SHA-256.
3. Dispara o instalador nativo em processo separado (`msiexec /i … /qn`,
   `apt-get/dnf install`, `installer -pkg`), que para o serviço, troca os arquivos
   mantendo o `.env` e sobe o serviço de novo.
4. Se a versão nova não passar no health check, o pacote anterior (guardado em
   `updates/`) é reinstalado.

## Licença

Apache 2.0 — ver [LICENSE](LICENSE).
