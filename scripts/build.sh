#!/usr/bin/env bash
# Cross-compiles the agent and the tray app per runtime identifier (same names as the .NET edition).
#   scripts/build.sh                      -> all RIDs
#   scripts/build.sh linux-x64 win-x64    -> some
# Env: VERSION (default: VERSION file), TAGS (extra build tags, e.g. "odbc" - needs CGO + unixodbc-dev),
#      CGO_ENABLED (default 0; set 1 for -tags odbc), GO (default go).
# Output: artifacts/publish/<rid>/sdz-agent[.exe] and sdz-agent-tray[.exe]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export GOTOOLCHAIN="${GOTOOLCHAIN:-auto}"
GO="${GO:-go}"
VERSION="${VERSION:-$(tr -d '[:space:]' < VERSION)}"
TAGS="${TAGS:-}"
RIDS=("$@")
[ ${#RIDS[@]} -gt 0 ] || RIDS=(win-x64 linux-x64 linux-arm64 osx-x64 osx-arm64)
MODULE="github.com/seedz-ag/sdz-agent-go"
LDFLAGS="-s -w -X ${MODULE}/internal/core.Version=${VERSION}"
HOST_OS="$(uname -s | tr '[:upper:]' '[:lower:]')"

rid_to_target() {
  case "$1" in
    win-x64) echo "windows amd64 .exe" ;;
    linux-x64) echo "linux amd64" ;;
    linux-arm64) echo "linux arm64" ;;
    osx-x64) echo "darwin amd64" ;;
    osx-arm64) echo "darwin arm64" ;;
    *) echo "unsupported rid: $1" >&2; return 1 ;;
  esac
}

# Optional Windows resources (icon + manifest) for the tray exe when go-winres is available.
winres() {
  command -v go-winres >/dev/null 2>&1 || return 0
  go-winres simply --icon cmd/sdz-agent-tray/assets/sdz-agent.ico --manifest gui \
    --product-name "SDZ Agent" --product-version "$VERSION" --file-version "$VERSION" \
    --out cmd/sdz-agent-tray/rsrc >/dev/null
}

for RID in "${RIDS[@]}"; do
  read -r GOOS GOARCH EXT <<<"$(rid_to_target "$RID")"
  OUT="artifacts/publish/$RID"
  mkdir -p "$OUT"
  echo "==> $RID (GOOS=$GOOS GOARCH=$GOARCH tags='${TAGS}')"
  CGO="${CGO_ENABLED:-0}"
  [ -n "$TAGS" ] && [[ "$TAGS" == *odbc* ]] && CGO=1
  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED="$CGO" "$GO" build -trimpath -tags "$TAGS" -ldflags "$LDFLAGS" \
    -o "$OUT/sdz-agent${EXT:-}" ./cmd/sdz-agent

  # tray: Fyne (OpenGL) needs CGO on every OS. Linux: gcc + libgl1-mesa-dev + xorg-dev.
  # Windows: build natively on Windows (MinGW gcc) or cross with x86_64-w64-mingw32-gcc. macOS: only on a Mac.
  if [ "$GOOS" = darwin ] && [ "$HOST_OS" != darwin ]; then
    echo "    (tray skipped for $RID: needs CGO/Cocoa, build it on macOS)"
    continue
  fi
  TRAY_LD="$LDFLAGS"
  [ "$GOOS" = windows ] && TRAY_LD="$LDFLAGS -H=windowsgui" && winres
  TRAY_CGO=1
  TRAY_CC="${CC:-}"
  if [ "$GOOS" = linux ] && [ "$GOARCH" != "$(go env GOHOSTARCH)" ]; then
    if command -v aarch64-linux-gnu-gcc >/dev/null 2>&1 && [ "$GOARCH" = arm64 ]; then TRAY_CC=aarch64-linux-gnu-gcc; else
      echo "    (tray skipped for $RID: cross-compiling the Fyne tray needs a $GOARCH C toolchain + X11/GL libs)"; continue; fi
  fi
  if [ "$GOOS" = windows ] && [ "$(uname -s)" != "MINGW64_NT"* ] && [ "$(go env GOHOSTOS)" != windows ]; then
    if command -v x86_64-w64-mingw32-gcc >/dev/null 2>&1; then TRAY_CC=x86_64-w64-mingw32-gcc; else
      echo "    (tray skipped for $RID: cross-compiling needs x86_64-w64-mingw32-gcc; build it on Windows or in the release workflow)"; continue; fi
  fi
  GOOS="$GOOS" GOARCH="$GOARCH" CGO_ENABLED="$TRAY_CGO" CC="${TRAY_CC:-${CC:-gcc}}" "$GO" build -trimpath -ldflags "$TRAY_LD" \
    -o "$OUT/sdz-agent-tray${EXT:-}" ./cmd/sdz-agent-tray
  rm -f cmd/sdz-agent-tray/rsrc_*.syso
  # Windows: ship Mesa's software OpenGL next to the tray (Fyne needs GL 2.0; VMs/RDP only have 1.1)
  if [ "$GOOS" = windows ] && [ -z "${SKIP_MESA:-}" ]; then scripts/fetch-mesa.sh "$OUT" || echo "    (mesa not fetched: $?)"; fi
done

echo
echo "artifacts:"
for RID in "${RIDS[@]}"; do
  du -sh artifacts/publish/"$RID"/sdz-agent* 2>/dev/null || true
done
