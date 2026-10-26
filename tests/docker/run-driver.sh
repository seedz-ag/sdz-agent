#!/usr/bin/env bash
# Roda uma extração completa contra a API dev usando o banco local do driver indicado.
# Uso: run-driver.sh <postgres|redshift|mongo|firebird|mssql|oracle> [data-dir]
set -uo pipefail
cd "$(dirname "$0")"
driver="${1:?driver}"; data="${2:-/tmp/sdz-agent-e2e}"
BIN="${SDZ_AGENT_BIN:-../../bin/sdz-agent}"
[ -x "$BIN" ] || { echo "binário não encontrado: $BIN (rode: GOTOOLCHAIN=auto go build -o bin/sdz-agent ./cmd/sdz-agent)" >&2; exit 1; }
./render-overrides.sh
export SDZ_AGENT_SETTING_OVERRIDE="$PWD/overrides/rendered/$driver.json"
rm -rf "$data/output"; mkdir -p "$data/output" results
start=$(date +%s)
timeout 1200 "$BIN" execute --data-dir "$data" -c > "results/$driver.log" 2>&1; code=$?
echo "== $driver: exit=$code em $(( $(date +%s) - start ))s"
grep -E " error |✖" "results/$driver.log" | grep -v "propriedades" | head -8
python3 -I - "$data/output" <<'PY'
import json,glob,os,sys,collections
c=collections.Counter()
for f in glob.glob(os.path.join(sys.argv[1],'raw-*.json')):
    c[os.path.basename(f).rsplit('-',1)[0][4:]]+=len(json.load(open(f)))
print("rows:", dict(sorted(c.items())))
PY
grep -E "TOTAL EXTRACTION" "results/$driver.log"
