#!/usr/bin/env bash
# Publishes self-contained single-file binaries (agent + tray app) per runtime identifier.
#   scripts/publish.sh                 -> all RIDs
#   scripts/publish.sh linux-x64 win-x64
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RIDS=("$@")
[ ${#RIDS[@]} -gt 0 ] || RIDS=(win-x64 linux-x64 linux-arm64 osx-x64 osx-arm64)

for RID in "${RIDS[@]}"; do
  OUT="$ROOT/artifacts/publish/$RID"
  echo "==> publishing $RID -> $OUT"
  dotnet publish "$ROOT/src/Sdz.Agent/Sdz.Agent.csproj" -c Release -r "$RID" --self-contained true \
    -p:PublishSingleFile=true -p:DebugType=embedded -o "$OUT" -nologo -v q
  # tray app (Avalonia) published next to the agent: sdz-agent-tray / sdz-agent-tray.exe
  dotnet publish "$ROOT/src/Sdz.Agent.Tray/Sdz.Agent.Tray.csproj" -c Release -r "$RID" --self-contained true \
    -p:PublishSingleFile=true -p:DebugType=embedded -o "$OUT" -nologo -v q
  rm -f "$OUT"/*.pdb
done

echo
echo "artifacts:"
for RID in "${RIDS[@]}"; do
  du -sh "$ROOT/artifacts/publish/$RID"/sdz-agent* 2>/dev/null | sed "s|$ROOT/||"
done
