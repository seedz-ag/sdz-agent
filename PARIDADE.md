# Paridade com o sdz-agent (Node) — desvios deliberados

Este documento lista onde o agente .NET se comporta de forma diferente do
`seedz-ag/sdz-agent` 2.3.1 e por quê. Tudo que não está aqui foi portado com
o mesmo comportamento, incluindo mensagens de log, nomes de arquivos em
`output/`, formato dos logs enviados para `/logs` e o payload de telemetria.

| Área | Node | .NET | Motivo |
|---|---|---|---|
| Oracle | modo Thick (`initOracleClient`, Instant Client 76 MB + libaio) | driver managed (`Oracle.ManagedDataAccess.Core`), sem Instant Client; `ALTER SESSION SET CURRENT_SCHEMA` só quando `DATABASE_SCHEMA` existe | elimina a maior dependência de instalação; Oracle 11g continua suportado pelo driver managed |
| Hydrator | valores `Date` sumiam no `flatten` (viravam `""`); `From` inexistente virava a string `"undefined"`; pipe desconhecido lançava `TypeError` | `DateTime` é escalar; `From` inexistente vira `""`; pipe desconhecido é ignorado | bugs silenciosos do original |
| Interpolação | `now`/`yesterday`/`tomorrow` calculados uma vez no start do processo (ficavam velhos no scheduler); chaves com espaço (`{{ x }}`) viravam `""`; body JSON não recebia o `scope` (`JSON.parse(..., scope)`) | datas calculadas a cada chamada; chaves com `trim`; body JSON recebe o scope | correção de bugs; nenhum template que funcionava deixa de funcionar |
| Listen `Query` | bloqueio de UPDATE/INSERT/DELETE não funcionava (`'UPDATE '` com espaço nunca batia) | bloqueia UPDATE, INSERT, DELETE, DROP, TRUNCATE, ALTER | a proteção pretendida passa a valer |
| `executeQueryRemote` | em erro devolvia o objeto `Error` (serializava como `{}`) | devolve a mensagem do erro | resposta legível no canal de comandos |
| `check auth` | timeout de 1 s | 10 s | evitava FAIL falso em links lentos |
| `check dns` | nunca implementado (sempre FAIL) | resolve o host da `API_URL` | |
| `check speed` | 50 MB de download + upload para `www.google.com` (sempre falhava) | 10 MB download + 5 MB upload via httpbin | |
| Scheduler | se `getSetting` falhasse, reiniciava em loop imediato (martelava a API); execuções agendadas podiam sobrepor | backoff de 60 s; execução sobreposta é pulada com aviso | |
| `API_URL` | precisava terminar com `/` | barra final adicionada se faltar | wiki antiga documentava sem a barra |
| Arquivo raw do HTTP consumer | `raw-<resource>}-0001.json` (chave sobrando) | `raw-<resource>-0001.json` | cosmético |
| VPN | `sudo -- sh -c "openvpn ..."`, 10 s de espera, só Linux | `openvpn` direto quando root, `sudo` caso contrário, `openvpn.exe` no Windows, 60 s de espera | serviço roda como root/LocalSystem |
| `update` | `git pull` | manifesto assinado + pacote nativo (MSI/deb/rpm/pkg) + rollback | não há mais clone git no cliente |
| Diretório de trabalho | `process.cwd()` (raiz do clone) | `SDZ_AGENT_DATA_DIR` → cwd com `.env` → padrão por SO | Program Files é somente leitura |
| `run` | sempre uma extração | uma extração quando chamado pelo usuário; modo serviço (scheduler + listen) quando iniciado por SCM/systemd/launchd ou `SDZ_AGENT_SERVICE=1`; `execute` é o alias explícito | um único entrypoint para os instaladores |
| Spinner | `ora` no terminal | linha `RUNNING ...` | sem dependência de TTY |
| CSV adapter | registrado, nunca usado | não portado | código morto |

## Validado em 2026-10-20 (dev)

- Setting `e988523c` (SEEDZ, MySQL RDS `agent_mock`, canal AGENT): `configure` + `check all` (AUTH, DNS, DATASOURCE OK) + `execute -c` duas vezes. 8 entidades enviadas (clients, invoice-items, invoices, items, order-items, orders, receivables, sellers), `LastReceivedAt` de todos os schemas atualizado pela API e `LAST_EXTRACTION` tocado. `property` falha igual ao Node porque a tabela `agent_mock.propriedadesP` não existe na setting.
- Colunas e nomes de arquivo em `output/` idênticos aos do Node (`raw-<resource>-0001.json`, `<resource>-0001.json`, `<entity>-<n>.sql`).
- Driver MySQL coberto por `tests/Sdz.Agent.Tests/Data/MySqlIntegrationTests.cs` (roda quando `SDZ_TEST_MYSQL_*` está no ambiente).
- Ajuste feito a partir do teste: `Connection: close` em toda requisição (paridade com o axios sem keep-alive) e retry em erro de transporte no envio de `/logs`. Antes disso, 3 lotes de log falharam durante POSTs grandes e ficaram em `output/<data>.log`, que o próximo `execute` reenviou e apagou (mecanismo de reenvio confirmado).

- Todos os drivers validados em 2026-10-20 com bancos locais em Docker (`tests/docker/`) populados com 4.000 linhas fictícias (DATE, TIMESTAMP, DECIMAL, INT, NULLs), enviando para a mesma setting de dev: POSTGRES, REDSHIFT (driver Postgres), MONGODB (aggregate com `$skip/$limit`), FIREBIRD, MSSQL (paginação `TIPOQUERY`/`R_E_C_N_O_`), ORACLE (managed, Free 23) e ODBC (psqlodbc dentro de container). Cada extração: 8 entidades, 4.000 linhas, 0 erros além da tabela `propriedades` inexistente.
- Recurso de teste adicionado: `SDZ_AGENT_SETTING_OVERRIDE=<json>` substitui parâmetros/queries da setting localmente (não existe no Node).
- `InvariantGlobalization=false` (voltou em 26/10): o driver `Microsoft.Data.SqlClient` recusa o modo invariante ("Globalization Invariant Mode is not supported"), então o pacote Linux depende de `libicu` e só o projeto de testes usa invariante. Números decimais saem na forma mais curta (`4599.0` → `4599`), igual ao Go.

## Ainda não validado

- Consumers HTTP e FTP e o canal SAAS_S3 não foram exercitados ponta a ponta.
- MSI: o WiX 5 só compila no Windows; a primeira build acontece no job `build-windows` do GitHub Actions. Pontos a observar: `FileSearch Name=".env"` e `Cultures pt-BR;en-US`.
- macOS: P/Invoke de métricas de sistema não foi executado em um Mac.

## Adições que não existem no Node (2026-10-20, tarde)

- **Canal de controle local** (`Hosting/ControlServer.cs`, lib `Sdz.Agent.Control`): named pipe `sdz-agent-control` no Windows (Authenticated Users) e socket `/run/sdz-agent/control.sock` no Linux (0660, grupo `sdz-agent`; 0666 com aviso se o grupo não existir; `SDZ_AGENT_CONTROL_MODE=0600` restringe). Operações `status`, `configure` (valida na API, grava `.env`, reinicia o scheduler), `clear` (remove o `.env`, scheduler ocioso), `run`, `logs`, `clearlogs`. Usado por `sdz-agent status`, por `sdz-agent credentials set|show|test|clear` (gestão das credenciais pelo terminal; `configure` virou alias de `credentials set`; secret por `--client-secret-stdin` ou `SDZ_CLIENT_ID`/`SDZ_CLIENT_SECRET`) e pelo tray. Sem serviço no ar, `credentials` edita o `.env` local (0640 root:sdz-agent).
- **Serviço sem credenciais**: `run` em modo serviço não falha mais sem `.env`; fica ocioso até receber `configure` pelo canal.
- **`sdz-agent-tray`** (Avalonia, Windows/Linux/macOS): ícone na bandeja com status (verde/laranja/cinza), menu (abrir painel, executar agora, pasta de logs, iniciar com o sistema, sair) e painel com credenciais, status e últimos logs. Autostart por usuário: chave `Run` do HKCU no Windows, `~/.config/autostart` no Linux. Painel mantém Client ID/Secret preenchidos (secret mascarado, botão de olho revela); botão/menu "Limpar logs" (operação `clearlogs`, apaga `logs/agent-*.log`, preserva `output/*.log`); janela abre na frente (Topmost momentâneo); ícone = esfera Seedz do sdz-nfe-agent com ponto central amarelo, variantes laranja/cinza; no Linux o ícone da janela vem do `.desktop` (`StartupWMClass=sdz-agent-tray`). Testado no GNOME 46 (Ubuntu, extensão AppIndicator) contra o serviço rodando sem configuração: salvar credenciais pelo painel reinicia o scheduler em segundos.

## Comparação final Node × .NET (2026-10-21)

Checklist completo do `src/` do Node: comandos (check/configure/run/listen/scheduler/update), subcomandos do listen (Execute/Ping/Query/Response/Shell), 3 consumers, 2 transports, 8 drivers, hydrator, interpolação, telemetria, VPN, reenvio de logs, discovery por `ENV`, todas as variáveis do schema zod. Tudo portado. O que ficou de fora é código morto no Node: `--query`/`QUERY` (parseado, nunca lido), `LOG_PING` (comentado), `CSVAdapter` e `normalizeObjectKeys` (sem chamadores), `ftp.transport.ts` (vazio). Gap real encontrado e fechado: infra da imagem SaaS (`Dockerfile`, `docker-compose.yml`, `.pipeline/agent-saas.yaml`), agora presente no projeto .NET.
- **Diretório de dados no Windows**: a pasta de instalação (ao lado do exe), não `%ProgramData%` nem o CWD (o serviço roda em System32); o Node usava `process.cwd()`. Linux/macOS: `/var/lib/sdz-agent`.
- **Listen sempre ativo (26/10)**: no Node o `listen` era aberto uma vez por ciclo do scheduler e, se o stream do `/commands` caísse, só voltava quando a setting mudasse. Agora, no modo serviço, o canal de comandos roda num laço próprio (independente da setting e da checagem de autenticação), com watchdog de 90 s (a API manda `Ping` a cada 30 s), reconexão com backoff 2→60 s e reconexão imediata quando as credenciais mudam pelo tray/CLI. `status` mostra `listening: yes` só com a conexão de fato aberta.
- **Comando remoto `Update` (26/10)**: novo (o Node não tinha). Pelo `/commands`, `arguments` `[]`/`["check"]`/`["force"]`/`[{"version","force","check","manifestUrl"}]`; responde `{status,current,target,message}` antes de iniciar o instalador; `manifestUrl` só com assinatura ativa; bloqueado durante extração sem `force`; uma atualização por vez. No Windows o pacote do manifesto agora é o `setup.exe` (NSIS), executado com `/S /D=<pasta atual>`; o instalador espera o serviço parar antes de copiar.
