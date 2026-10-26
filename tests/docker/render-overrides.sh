#!/usr/bin/env bash
# Renders overrides/*.json (with ${MOCK_PASSWORD} / ${MSSQL_SA_PASSWORD} placeholders) into
# overrides/rendered/ using the local tests/docker/.env, so no password is committed.
set -euo pipefail
cd "$(dirname "$0")"
[ -f .env ] || { echo "tests/docker/.env not found (MOCK_PASSWORD=..., MSSQL_SA_PASSWORD=...)" >&2; exit 1; }
set -a; . ./.env; set +a
mkdir -p overrides/rendered
python3 -I - <<'PY'
import glob, os
for f in glob.glob("overrides/*.json"):
    s = open(f).read()
    for k in ("MOCK_PASSWORD", "MSSQL_SA_PASSWORD"):
        s = s.replace("${" + k + "}", os.environ.get(k, ""))
    open(os.path.join("overrides/rendered", os.path.basename(f)), "w").write(s)
PY
