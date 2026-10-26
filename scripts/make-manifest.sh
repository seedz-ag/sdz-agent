#!/usr/bin/env bash
# Generates artifacts/manifest.json consumed by `sdz-agent update`.
#   scripts/make-manifest.sh [version] [channel]
# Env: RELEASE_BASE_URL (default https://github.com/seedz-ag/sdz-agent-go/releases/download/v<version>)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="${1:-$(tr -d "[:space:]" < "$ROOT/VERSION")}"
CHANNEL="${2:-stable}"
BASE="${RELEASE_BASE_URL:-https://github.com/seedz-ag/sdz-agent-go/releases/download/v$VERSION}"
ART="$ROOT/artifacts"
OUT="$ART/manifest.json"

sha() { if command -v sha256sum >/dev/null; then sha256sum "$1" | cut -d' ' -f1; else shasum -a 256 "$1" | cut -d' ' -f1; fi; }

# key -> file glob
declare -A FILES=(
  ["win-x64"]="sdz-agent-$VERSION-win-x64-setup.exe"   # NSIS setup: self-update reinstalls into the current folder (/S /D=)
  ["linux-x64-deb"]="sdz-agent_${VERSION}_amd64.deb"
  ["linux-x64-rpm"]="sdz-agent-$VERSION-1.x86_64.rpm"
  ["linux-arm64-deb"]="sdz-agent_${VERSION}_arm64.deb"
  ["linux-arm64-rpm"]="sdz-agent-$VERSION-1.aarch64.rpm"
  ["osx-x64"]="sdz-agent-$VERSION-osx-x64.pkg"
  ["osx-arm64"]="sdz-agent-$VERSION-osx-arm64.pkg"
)
ORDER=(win-x64 linux-x64-deb linux-x64-rpm linux-arm64-deb linux-arm64-rpm osx-x64 osx-arm64)

{
  printf '{\n  "version": "%s",\n  "channel": "%s",\n  "publishedAt": "%s",\n  "packages": {\n' \
    "$VERSION" "$CHANNEL" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  first=1
  for KEY in "${ORDER[@]}"; do
    FILE="$(find "$ART" -maxdepth 2 -name "${FILES[$KEY]}" | head -1)"
    [ -n "$FILE" ] || { echo "  (skipping $KEY: ${FILES[$KEY]} not found)" >&2; continue; }
    [ $first -eq 1 ] || printf ',\n'
    first=0
    printf '    "%s": { "url": "%s/%s", "sha256": "%s", "size": %s }' \
      "$KEY" "$BASE" "$(basename "$FILE")" "$(sha "$FILE")" "$(stat -c%s "$FILE" 2>/dev/null || stat -f%z "$FILE")"
  done
  printf '\n  }\n}\n'
} > "$OUT"

echo "wrote $OUT"; cat "$OUT"
