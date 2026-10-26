#!/usr/bin/env bash
# Builds the Windows wizard installer (setup.exe, NSIS) on Linux inside Docker.
# Usage: scripts/build-setup-linux.sh [publish-dir] [output.exe]
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${VERSION:-$(grep -oP '<Version>\K[^<]+' Directory.Build.props 2>/dev/null || cat VERSION 2>/dev/null || echo 0.0.0)}"
PUBLISH="${1:-artifacts/publish/win-x64}"
OUT="${2:-artifacts/sdz-agent-${VERSION}-win-x64-setup.exe}"
IMAGE="${NSIS_IMAGE:-sdz-nsis}"
: "${PRODUCT_NAME:=SDZ Agent}"
: "${REG_KEY:=sdz-agent-dotnet}"
test -f "$PUBLISH/sdz-agent.exe" -a -f "$PUBLISH/sdz-agent-tray.exe" || { echo "binários Windows ausentes em $PUBLISH"; exit 1; }
mkdir -p "$(dirname "$OUT")"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" - <<'DOCKER'
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends nsis nsis-pluginapi ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /work
ENTRYPOINT ["makensis"]
DOCKER
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work "$IMAGE" -V2 \
  -DVERSION="$VERSION" -DPRODUCT_NAME="$PRODUCT_NAME" -DREG_KEY="$REG_KEY" \
  -DPUBLISH_DIR="/work/$PUBLISH" -DOUT_FILE="/work/$OUT" -DICON_FILE="/work/installer/windows/seedz.ico" -DLICENSE_FILE="/work/LICENSE" \
  installer/windows/nsis/sdz-agent.nsi
ls -la "$OUT"
