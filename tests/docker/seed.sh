#!/usr/bin/env bash
# Popula um banco do compose com os dados gerados por gen_data.py.
set -euo pipefail
cd "$(dirname "$0")"
set -a; . ./.env; set +a
db="${1:?uso: seed.sh postgres|mssql|mongo|firebird|oracle}"
wait_for() { for i in $(seq 1 90); do if docker compose exec -T "$1" sh -c "$2" >/dev/null 2>&1; then return 0; fi; sleep 3; done; echo "timeout esperando $1"; return 1; }
case "$db" in
  postgres)
    wait_for postgres "pg_isready -U agent -d agent_mock"
    docker compose exec -T -e PGPASSWORD="$MOCK_PASSWORD" postgres psql -q -v ON_ERROR_STOP=1 -U agent -d agent_mock < seed/postgres.sql
    docker compose exec -T -e PGPASSWORD="$MOCK_PASSWORD" postgres psql -tA -U agent -d agent_mock -c "select 'clientes', count(*) from agent_mock.clientes union all select 'pedidos', count(*) from agent_mock.pedidos";;
  mssql)
    wait_for mssql "/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P \"\$MSSQL_SA_PASSWORD\" -Q 'select 1'"
    docker compose exec -T mssql sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -b -i /dev/stdin' < seed/mssql.sql
    docker compose exec -T mssql sh -c '/opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -d agent_mock -h -1 -Q "select count(*) from agent_mock.clientes"';;
  mongo)
    wait_for mongo "mongosh --quiet --eval 'db.runCommand({ping:1}).ok'"
    for f in seed/mongo/*.json; do c=$(basename "$f" .json)
      docker compose exec -T mongo mongoimport --quiet -u agent -p "$MOCK_PASSWORD" --authenticationDatabase admin --db agent_mock --collection "$c" --drop --jsonArray < "$f"; done
    docker compose exec -T mongo mongosh --quiet -u agent -p "$MOCK_PASSWORD" --authenticationDatabase admin agent_mock --eval 'print("clientes", db.clientes.countDocuments(), "pedidos", db.pedidos.countDocuments())';;
  firebird)
    wait_for firebird "test -f /var/lib/firebird/data/agent_mock.fdb"
    docker compose exec -T firebird sh -c '/opt/firebird/bin/isql -q -u agent -p "$FIREBIRD_PASSWORD" localhost:/var/lib/firebird/data/agent_mock.fdb -i /dev/stdin' < seed/firebird.sql
    docker compose exec -T firebird sh -c 'echo "select count(*) from clientes;" | /opt/firebird/bin/isql -q -u agent -p "$FIREBIRD_PASSWORD" localhost:/var/lib/firebird/data/agent_mock.fdb';;
  oracle)
    wait_for oracle "healthcheck.sh"
    docker compose exec -T oracle sh -c 'sqlplus -s agent_mock/"$APP_USER_PASSWORD"@localhost/FREEPDB1' < seed/oracle.sql | grep -v "^$" | grep -vi "row created" | head -20
    docker compose exec -T oracle sh -c 'echo "select count(*) from clientes;" | sqlplus -s agent_mock/"$APP_USER_PASSWORD"@localhost/FREEPDB1';;
  *) echo "banco desconhecido: $db"; exit 1;;
esac
