# Bancos locais para validar os drivers

Sobe os bancos em Docker, popula com dados fictícios (mesmas 8 tabelas e colunas do
`agent_mock` do MySQL de dev, com tipos reais: DATE, TIMESTAMP, DECIMAL, INT, NULLs) e
roda uma extração completa do agente contra a API dev usando a setting de teste
(`e988523c`, SEEDZ MySQL "NAO REMOVER MINIMO"), sem alterar a setting na plataforma.

## Como funciona

- `schema.json`: colunas inferidas de uma extração real (`raw-*.json`).
- `gen_data.py`: gera `seed/<banco>.sql` e `seed/mongo/*.json` (determinístico, seed 42).
- `docker-compose.yml` + `seed.sh <banco>`: sobe e popula Postgres, SQL Server, Mongo, Firebird e Oracle Free.
- `overrides/<driver>.json`: parâmetros `DATABASE_*` e queries por driver. O agente lê o arquivo
  apontado por `SDZ_AGENT_SETTING_OVERRIDE` depois de buscar a setting na API e substitui
  parâmetros/queries localmente (recurso só de desenvolvimento; não existe no agente Node).
- `run-driver.sh <driver> [data-dir]`: `sdz-agent execute -c` com o override; log em `results/`.
- `run-odbc.sh [data-dir]`: mesmo fluxo via ODBC, rodando o binário publicado dentro de um
  container com unixODBC + psqlodbc (`Dockerfile.odbc`), porque o host não tem unixODBC.

## Passo a passo

```bash
python3 gen_data.py
docker compose up -d postgres mongo firebird        # leves
./seed.sh postgres && ./seed.sh mongo && ./seed.sh firebird
docker compose up -d mssql oracle                   # ~2 GB cada; a primeira subida do Oracle leva alguns minutos
./seed.sh mssql && ./seed.sh oracle

# binário do agente Go (ou SDZ_AGENT_BIN=/caminho/sdz-agent)
(cd ../.. && GOTOOLCHAIN=auto go build -o bin/sdz-agent ./cmd/sdz-agent)
# data-dir precisa ter o .env com API_URL/CLIENT_ID/CLIENT_SECRET da setting de teste (sdz-agent configure)
for d in postgres redshift mongo firebird mssql oracle; do ./run-driver.sh $d /tmp/sdz-agent-e2e; done
./run-odbc.sh /tmp/sdz-agent-e2e-odbc      # compila com -tags odbc dentro do container (CGO)
```

Particularidades por driver (as mesmas do agente Node):

| Driver | Query | Observação |
|---|---|---|
| POSTGRES / REDSHIFT | `SELECT * FROM agent_mock.<tabela>` | `DATABASE_SCHEMA` = database |
| MSSQL | idem | tabelas precisam das colunas `TIPOQUERY` e `R_E_C_N_O_` quando a query não tem `ORDER BY` (paginação Protheus) |
| ORACLE | idem (resolve para `AGENT_MOCK.<TABELA>`) | `DATABASE_SERVICE` = `FREEPDB1`; colunas voltam em maiúsculas |
| FIREBIRD | `SELECT * FROM <tabela>` (sem schema) | `DATABASE_SCHEMA` = caminho do `.fdb` no servidor |
| MONGODB | `{"collection":"x","command":"aggregate","aggregate":[{"$skip"::skip},{"$limit"::limit}]}` | `find` sem `$skip/$limit` pagina para sempre, como no Node |
| ODBC | `SELECT * FROM agent_mock.<tabela>` | `DATABASE_CONNECTIONSTRING` com o driver do unixODBC; só em builds `-tags odbc` |
