# Paridade — edição Go

O porte em Go reproduz o agente .NET (`/opt/sdz-agent-dotnet`), que por sua vez reproduz o
agente Node `seedz-ag/sdz-agent` 2.3.1. **Toda a lista de desvios deliberados em relação ao
Node vale também aqui** e está em `sdz-agent-dotnet/PARIDADE.md` (Oracle sem Instant Client,
correções no hydrator/interpolação, bloqueio real de UPDATE/INSERT/DELETE no `Query` remoto,
timeouts do `check`, backoff do scheduler, `API_URL` com barra, `run` como modo serviço,
canal de controle local, serviço sem credenciais, tray, `SDZ_AGENT_SETTING_OVERRIDE`,
`Connection: close`, retry no envio de logs, `clearlogs`).

Desvios específicos da edição Go em relação à .NET:

| Área | .NET | Go | Motivo |
|---|---|---|---|
| ODBC | `System.Data.Odbc` sempre presente | driver `alexbrainman/odbc` atrás da build tag `odbc` (CGO + unixODBC); os binários padrão são estáticos sem ODBC; o `linux-x64` da release e a imagem Docker são compilados com a tag | manter o binário estático e a compilação cruzada sem toolchain C |
| Oracle | `Oracle.ManagedDataAccess.Core` (driver oficial, managed) | `sijms/go-ora` (puro Go, comunitário) | não existe driver oficial puro Go; validar LONG/CLOB e versões antigas nos clientes Oracle |
| Painel do tray | janela nativa (Avalonia) | janela nativa com Fyne (OpenGL, CGO em todos os SOs); ícone de bandeja pelo próprio Fyne (DBus no Linux, Win32 no Windows, Cocoa no macOS); mesmos textos e funções do painel .NET | primeira versão usava uma página web local; trocada a pedido por um aplicativo de verdade |
| Ícone do tray no Windows | PNG por estado | o `.ico` do Seedz é único; o estado (verde/laranja/cinza) aparece no tooltip e no primeiro item do menu | `systray` no Windows exige ICO; gerar três ICOs fica como melhoria |
| Ícone/versão no `.exe` | embutido pelo SDK | só quando `go-winres` está no PATH ao rodar `scripts/build.sh` (o CI instala); o MSI usa `seedz.ico` de qualquer forma | |
| macOS | tray e agente cross-compilados de qualquer SO | o agente cross-compila; o tray só compila num Mac (Cocoa/cgo); `build-pkg.sh` empacota o tray quando ele existe | |
| systemd | `Type=notify` (sd_notify) | `Type=simple` | kardianos/service não faz sd_notify |
| Tamanho | agente 51 MB, tray 48 MB | agente ~15 MB, tray ~13 MB, sem dependência de ICU | binários estáticos |
| Versão | `Directory.Build.props` | arquivo `VERSION` + `-ldflags -X internal/core.Version` | |

Instaladores: o MSI tem UpgradeCode próprio e nome "SDZ Agent (Go)"; o `.deb`/`.rpm`
mantém o nome `sdz-agent`. As duas edições registram o mesmo serviço `SDZ-AGENT` e o mesmo
diretório de dados: só uma pode estar instalada por máquina. O protocolo do canal de
controle usa os mesmos nomes JSON, então o tray de uma edição fala com o serviço da outra
(validado: tray Go contra o serviço .NET de teste nesta máquina).

## Validado em 2026-10-21

- Ponta a ponta no dev com a setting `e988523c` (MySQL RDS): `configure`, `check all` (AUTH/DNS/DATASOURCE OK) e `execute -c` completo, 8 entidades, ordem de colunas preservada nos JSON.
- 7 drivers com os bancos Docker de `tests/docker/` (4.000 linhas fictícias cada): POSTGRES, REDSHIFT, MONGODB, FIREBIRD, MSSQL, ORACLE (go-ora) e ODBC (compilado com `-tags odbc` dentro do container, psqlodbc). Único erro em todos: tabela `propriedades` inexistente, igual ao Node e ao .NET.
- `go test ./...` verde (core, cli, services, control, hosting, telemetry, update, drivers com integração MySQL); cross-compile do agente para windows/amd64, darwin/arm64 e linux/arm64 sem CGO; tray (Fyne) compilado e executado no GNOME desta máquina; Windows via MinGW no runner, macOS só num Mac.
- Tray Go testado no GNOME desta máquina contra o serviço .NET: protocolo de controle intercambiável.
- **Credenciais pelo terminal**: `sdz-agent credentials set|show|test|clear` igual ao .NET (canal de controle com op `clear`, fallback para o `.env` local, secret por stdin/variáveis `SDZ_*`, `.env` 0640 root:sdz-agent); `configure` é alias de `credentials set`.
- **Windows/OpenGL**: o painel Fyne precisa de OpenGL 2.0; o instalador embute o Mesa (llvmpipe) ao lado do tray para VMs/RDP, e o tray grava `%LOCALAPPDATA%\SEEDZ\sdz-agent\tray.log` + MessageBox se o GL falhar. O .NET (Avalonia/Skia) não tem essa dependência.
- **Diretório de dados no Windows**: a pasta de instalação (ao lado do exe), não `%ProgramData%` nem o CWD (o serviço roda em System32); o Node usava `process.cwd()`. Linux/macOS: `/var/lib/sdz-agent`.
- **Datas e números (26/10)**: colunas DATE (Postgres/Firebird/MSSQL/ODBC) saem como `2006-01-02`; instantes UTC (Mongo, `timestamptz`) com `Z`; demais timestamps `2006-01-02T15:04:05.000` sem offset; Oracle DATE mantém a hora. Decimais na forma mais curta (`4599.0` → `4599`). Tudo igual ao .NET, conferido byte a byte nos `raw-*.json` dos 8 conectores.
- **Listen sempre ativo (26/10)**: no Node o `listen` era aberto uma vez por ciclo do scheduler e, se o stream do `/commands` caísse, só voltava quando a setting mudasse. Agora, no modo serviço, o canal de comandos roda num laço próprio (independente da setting e da checagem de autenticação), com watchdog de 90 s (a API manda `Ping` a cada 30 s), reconexão com backoff 2→60 s e reconexão imediata quando as credenciais mudam pelo tray/CLI. `status` mostra `listening: yes` só com a conexão de fato aberta.
- **Comando remoto `Update` (26/10)**: novo (o Node não tinha). Pelo `/commands`, `arguments` `[]`/`["check"]`/`["force"]`/`[{"version","force","check","manifestUrl"}]`; responde `{status,current,target,message}` antes de iniciar o instalador; `manifestUrl` só com assinatura ativa; bloqueado durante extração sem `force`; uma atualização por vez. No Windows o pacote do manifesto agora é o `setup.exe` (NSIS), executado com `/S /D=<pasta atual>`; o instalador espera o serviço parar antes de copiar.
- **`listen --session-ttl` (PR #158 do Node, portado em 26/10)**: opcional, para a sessão de console SaaS. Encerra o `listen` após N minutos (mínimo 1) sem comando efetivo; `Ping`, `ListActiveClients` e `Response` não contam como atividade. `SESSION_TTL` inválido, zero ou negativo = sem limite (não derruba o agente). Saída limpa com `SESSION CLOSED BY TTL` e exit 0. Diferença deliberada: no modo serviço o TTL é ignorado com aviso, porque o canal de comandos do agente instalado fica sempre ativo.
