#!/usr/bin/env bash
# Builds .deb and .rpm packages with nfpm for one runtime identifier.
#   scripts/package-linux.sh linux-x64 [version]
#   scripts/package-linux.sh linux-arm64
# Requires nfpm (https://nfpm.goreleaser.com) on PATH or NFPM=/path/to/nfpm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RID="${1:-linux-x64}"
VERSION="${2:-$(tr -d '[:space:]' < "$ROOT/VERSION")}"
NFPM="${NFPM:-nfpm}"

case "$RID" in
  linux-x64) ARCH=amd64 ;;
  linux-arm64) ARCH=arm64 ;;
  *) echo "unsupported rid: $RID" >&2; exit 1 ;;
esac

BIN="$ROOT/artifacts/publish/$RID/sdz-agent"
TRAY="$ROOT/artifacts/publish/$RID/sdz-agent-tray"
[ -f "$BIN" ] || { echo "binary not found: $BIN (run scripts/build.sh $RID first)" >&2; exit 1; }
[ -f "$TRAY" ] || { echo "tray binary not found: $TRAY (run scripts/build.sh $RID first)" >&2; exit 1; }

mkdir -p "$ROOT/artifacts/stage/linux"
cp "$BIN" "$ROOT/artifacts/stage/linux/sdz-agent"
cp "$TRAY" "$ROOT/artifacts/stage/linux/sdz-agent-tray"
chmod 755 "$ROOT/artifacts/stage/linux/sdz-agent" "$ROOT/artifacts/stage/linux/sdz-agent-tray"

cd "$ROOT"
for FMT in deb rpm; do
  VERSION="$VERSION" ARCH="$ARCH" "$NFPM" package -f installer/linux/nfpm.yaml -p "$FMT" -t artifacts/
done
rm -rf "$ROOT/artifacts/stage"
ls -la "$ROOT"/artifacts/sdz-agent*"$VERSION"*.{deb,rpm} 2>/dev/null | sed "s|$ROOT/||"
