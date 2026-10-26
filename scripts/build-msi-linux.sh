#!/usr/bin/env bash
# Builds the Windows MSI on Linux with msitools/wixl inside Docker (no Windows needed).
# Usage: scripts/build-msi-linux.sh [publish-dir] [output.msi]
# Needs artifacts/publish/win-x64/{sdz-agent.exe,sdz-agent-tray.exe} (see scripts/publish.sh win-x64).
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${VERSION:-$(grep -oP '<Version>\K[^<]+' Directory.Build.props 2>/dev/null || cat VERSION 2>/dev/null || echo 0.0.0)}"
PUBLISH="${1:-artifacts/publish/win-x64}"
OUT="${2:-artifacts/sdz-agent-${VERSION}-win-x64.msi}"
IMAGE="${MSITOOLS_IMAGE:-sdz-msitools}"
: "${UPGRADE_CODE:=7E1C9B4A-2D53-4F6B-9C0E-5A8D2F3B6C11}"
: "${PRODUCT_NAME:=SDZ Agent}"
: "${GUID_NS:=sdz-agent-dotnet}"
test -f "$PUBLISH/sdz-agent.exe" -a -f "$PUBLISH/sdz-agent-tray.exe" || { echo "binários Windows ausentes em $PUBLISH"; exit 1; }
mkdir -p "$(dirname "$OUT")"
# stable component GUIDs derived from the project name (uuid5), so upgrades keep component identity
guid() { python3 -c "import uuid,sys; print(str(uuid.uuid5(uuid.NAMESPACE_DNS, sys.argv[1])).upper())" "$GUID_NS/$1"; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" - <<'DOCKER'
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends msitools wixl wixl-data ca-certificates python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /work
ENTRYPOINT ["wixl"]
DOCKER
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work "$IMAGE" -v -a x64 -o "$OUT" \
  -D Version="$VERSION" -D PublishDir="$PUBLISH" -D UpgradeCode="$UPGRADE_CODE" -D ProductName="$PRODUCT_NAME" -D Manufacturer="Seedz" \
  -D IconPath="installer/windows/seedz.ico" -D LicensePath="LICENSE" \
  -D GuidAgent="$(guid agent)" -D GuidTray="$(guid tray)" -D GuidLicense="$(guid license)" -D GuidShortcut="$(guid shortcut)" \
  -D GuidData="$(guid data)" -D GuidDataOut="$(guid data-out)" -D GuidDataLogs="$(guid data-logs)" \
  installer/windows/wixl/sdz-agent.wxs
ls -la "$OUT"
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/work" -w /work --entrypoint msiinfo "$IMAGE" export "$OUT" File | tail -n +4 | cut -f1,3,4 | head
