#!/usr/bin/env bash
# Runs one full extraction per driver with each agent (.NET and Go) under /usr/bin/time -v,
# keeps logs/outputs/time reports in $S/cmp, then compares outputs. ODBC runs in Docker (time + sampled memory).
set -uo pipefail
S="$(cd "$(dirname "$0")" && pwd)"
DN=/opt/sdz-agent-dotnet; GO=/opt/sdz-agent-go
BIN_dotnet="$DN/src/Sdz.Agent/bin/Release/net10.0/linux-x64/sdz-agent"
BIN_go="$GO/bin/sdz-agent"
DRIVERS="${DRIVERS:-postgres redshift mongo firebird mssql oracle mysql}"
export PATH="$HOME/.dotnet:$PATH"
cd "$DN/tests/docker"; ./render-overrides.sh; [ -d "$GO/tests/docker" ] && (cd "$GO/tests/docker" && ./render-overrides.sh); set -a; . ./.env; set +a; cd "$S"

wait_ready() {
  case "$1" in
    oracle) for i in $(seq 1 90); do [ "$(docker inspect --format '{{.State.Health.Status}}' sdz-agent-drivers-oracle-1 2>/dev/null)" = healthy ] && return 0; sleep 10; done; echo "oracle not healthy"; return 1;;
    mssql) for i in $(seq 1 60); do docker exec sdz-agent-drivers-mssql-1 /opt/mssql-tools18/bin/sqlcmd -C -S localhost -U sa -P "$MSSQL_SA_PASSWORD" -Q 'select 1' >/dev/null 2>&1 && return 0; sleep 5; done; echo "mssql not ready"; return 1;;
  esac
  return 0
}

run_one() { # driver kind
  local d="$1" k="$2" bin data
  bin="BIN_$k"; bin="${!bin}"; data="$S/data-$k"
  rm -rf "$data/output" "$S/out-$d-$k"; mkdir -p "$data/output"
  if [ "$d" = mysql ]; then unset SDZ_AGENT_SETTING_OVERRIDE; else export SDZ_AGENT_SETTING_OVERRIDE="$DN/tests/docker/overrides/rendered/$d.json"; fi
  /usr/bin/time -v -o "$S/time-$d-$k.txt" timeout 1500 "$bin" execute --data-dir "$data" -c > "$S/log-$d-$k.log" 2>&1
  echo "exit=$?" >> "$S/time-$d-$k.txt"
  cp -r "$data/output" "$S/out-$d-$k"
  unset SDZ_AGENT_SETTING_OVERRIDE
}

for d in $DRIVERS; do
  wait_ready "$d" || continue
  for k in dotnet go; do
    echo "== $d / $k $(date +%H:%M:%S)"; run_one "$d" "$k"
    grep -E "Elapsed|Maximum resident|exit=" "$S/time-$d-$k.txt" | tr -s ' ' | sed 's/^ //' | tr '\n' ';'; echo
  done
  python3 -I "$S/compare.py" "$S/out-$d-dotnet" "$S/out-$d-go" "$d" | tail -12
done

# ---- ODBC (inside Docker, on the compose network): wall time + sampled peak memory via docker stats
if [ -z "${SKIP_ODBC:-}" ]; then
  for k in dotnet go; do
    echo "== odbc / $k $(date +%H:%M:%S)"
    data="$S/data-odbc-$k"; rm -rf "$data"; mkdir -p "$data/output"; cp "$S/data-$k/.env" "$data/.env"
    name="sdz-odbc-bench-$k"; docker rm -f "$name" >/dev/null 2>&1
    if [ "$k" = dotnet ]; then
      (cd "$DN/tests/docker" && docker build -q -t sdz-agent-odbc-dotnet -f Dockerfile.odbc . >/dev/null)
      args=(--network sdz-agent-drivers_default -v "$DN/artifacts/publish/linux-x64:/app:ro" -v "$data:/data" -v "$DN/tests/docker/overrides/rendered:/overrides:ro" -e SDZ_AGENT_SETTING_OVERRIDE=/overrides/odbc.json sdz-agent-odbc-dotnet execute -c)
    else
      (cd "$GO/tests/docker" && docker build -q -t sdz-agent-odbc-go -f Dockerfile.odbc ../.. >/dev/null)
      args=(--network sdz-agent-drivers_default -v "$data:/data" -v "$GO/tests/docker/overrides/rendered:/overrides:ro" -e SDZ_AGENT_SETTING_OVERRIDE=/overrides/odbc.json sdz-agent-odbc-go execute -c)
    fi
    start=$(date +%s.%N)
    docker run -d --name "$name" "${args[@]}" >/dev/null
    peak=0
    while [ "$(docker inspect --format '{{.State.Running}}' "$name" 2>/dev/null)" = true ]; do
      m=$(docker stats --no-stream --format '{{.MemUsage}}' "$name" 2>/dev/null | awk '{v=$1; if (v ~ /GiB/) {sub("GiB","",v); v=v*1024} else if (v ~ /MiB/) {sub("MiB","",v)} else if (v ~ /KiB/) {sub("KiB","",v); v=v/1024} else v=0; printf "%d", v}')
      [ "${m:-0}" -gt "$peak" ] 2>/dev/null && peak=$m
      sleep 1
    done
    end=$(date +%s.%N)
    docker logs "$name" > "$S/log-odbc-$k.log" 2>&1
    code=$(docker inspect --format '{{.State.ExitCode}}' "$name"); docker rm -f "$name" >/dev/null
    LC_ALL=C printf 'Elapsed (wall clock) seconds: %.1f\nMaximum resident set size (kbytes): %d\nexit=%s\n' "$(python3 -c "print(round($end-$start,1))")" "$((peak*1024))" "$code" > "$S/time-odbc-$k.txt"
    cat "$S/time-odbc-$k.txt" | tr '\n' ';'; echo
    docker run --rm -v "$data:/d" alpine sh -c "chown -R $(id -u):$(id -g) /d" >/dev/null 2>&1
    rm -rf "$S/out-odbc-$k"; cp -r "$data/output" "$S/out-odbc-$k" 2>/dev/null || mkdir -p "$S/out-odbc-$k"
  done
  python3 -I "$S/compare.py" "$S/out-odbc-dotnet" "$S/out-odbc-go" odbc | tail -12
fi

# ---- startup time (process + runtime init): `version`, 5 runs each
for k in dotnet go; do bin="BIN_$k"; bin="${!bin}"; /usr/bin/time -f "%e" -o "$S/startup-$k.txt" -a bash -c "for i in 1 2 3 4 5; do $bin version >/dev/null; done"; done
ls -la "$BIN_dotnet" "$BIN_go" "$DN/artifacts/publish/linux-x64/sdz-agent" | awk '{print $5, $9}' > "$S/sizes.txt"
echo BENCH_DONE
