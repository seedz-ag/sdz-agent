#!/usr/bin/env bash
# Extração via ODBC (PostgreSQL Unicode) rodando o binário publicado dentro de um container na rede do compose.
set -uo pipefail
cd "$(dirname "$0")"
data="${1:-/tmp/sdz-agent-e2e-odbc}"; mkdir -p "$data/output" results
./render-overrides.sh
docker build -q -t sdz-agent-odbc -f Dockerfile.odbc . >/dev/null
start=$(date +%s)
docker run --rm --network sdz-agent-drivers_default \
  -v "$PWD/../../artifacts/publish/linux-x64:/app:ro" -v "$data:/data" -v "$PWD/overrides/rendered:/overrides:ro" \
  -e SDZ_AGENT_SETTING_OVERRIDE=/overrides/odbc.json \
  sdz-agent-odbc execute -c > results/odbc.log 2>&1; code=$?
echo "== odbc: exit=$code em $(( $(date +%s) - start ))s"
grep -E " error |✖" results/odbc.log | grep -v propriedades | head -8
python3 -I - "$data/output" <<'PY'
import json,glob,os,sys,collections
c=collections.Counter()
for f in glob.glob(os.path.join(sys.argv[1],'raw-*.json')): c[os.path.basename(f).rsplit('-',1)[0][4:]]+=len(json.load(open(f)))
print("rows:", dict(sorted(c.items())))
PY
grep -E "TOTAL EXTRACTION" results/odbc.log
