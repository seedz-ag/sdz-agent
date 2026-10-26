#!/usr/bin/env bash
# Builds sdz-agent-<version>-<arch>.pkg (macOS installer) from a published binary.
#
#   installer/macos/build-pkg.sh <rid> [version]      rid = osx-x64 | osx-arm64
#
# Env (optional): SIGN_IDENTITY="Developer ID Installer: Seedz (TEAMID)"
#                 NOTARY_PROFILE=<keychain profile created with `xcrun notarytool store-credentials`>
set -euo pipefail

RID="${1:-osx-arm64}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERSION="${2:-$(tr -d "[:space:]" < "$ROOT/VERSION")}"
IDENTIFIER="ag.seedz.sdz-agent"
BIN="$ROOT/artifacts/publish/$RID/sdz-agent"
TRAY="$ROOT/artifacts/publish/$RID/sdz-agent-tray"
OUT="$ROOT/artifacts"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

[ -f "$BIN" ] || { echo "binary not found: $BIN (run scripts/build.sh $RID first)" >&2; exit 1; }

case "$RID" in
  osx-x64) ARCH=x86_64 ;;
  osx-arm64) ARCH=arm64 ;;
  *) echo "unsupported rid: $RID" >&2; exit 1 ;;
esac

# payload layout
mkdir -p "$STAGE/root/opt/sdz-agent" "$STAGE/root/Library/LaunchDaemons" "$STAGE/root/var/lib/sdz-agent"
cp "$BIN" "$STAGE/root/opt/sdz-agent/sdz-agent"
cp "$ROOT/LICENSE" "$STAGE/root/opt/sdz-agent/LICENSE"
cp "$ROOT/installer/macos/ag.seedz.sdz-agent.plist" "$STAGE/root/Library/LaunchDaemons/"
chmod 755 "$STAGE/root/opt/sdz-agent/sdz-agent"
# tray app (optional in the payload; started per user through a LaunchAgent template)
if [ -f "$TRAY" ]; then
  cp "$TRAY" "$STAGE/root/opt/sdz-agent/sdz-agent-tray"
  chmod 755 "$STAGE/root/opt/sdz-agent/sdz-agent-tray"
  mkdir -p "$STAGE/root/Library/LaunchAgents"
  cp "$ROOT/installer/macos/ag.seedz.sdz-agent-tray.plist" "$STAGE/root/Library/LaunchAgents/"
fi

mkdir -p "$OUT"
COMPONENT="$STAGE/sdz-agent-component.pkg"
PRODUCT="$OUT/sdz-agent-$VERSION-$RID.pkg"

pkgbuild \
  --root "$STAGE/root" \
  --scripts "$ROOT/installer/macos/scripts" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location / \
  "$COMPONENT"

cat > "$STAGE/distribution.xml" <<XML
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="1">
  <title>SDZ Agent $VERSION</title>
  <organization>ag.seedz</organization>
  <domains enable_localSystem="true"/>
  <options customize="never" require-scripts="true" hostArchitectures="$ARCH"/>
  <license file="LICENSE"/>
  <choices-outline><line choice="default"><line choice="$IDENTIFIER"/></line></choices-outline>
  <choice id="default"/>
  <choice id="$IDENTIFIER" visible="false"><pkg-ref id="$IDENTIFIER"/></choice>
  <pkg-ref id="$IDENTIFIER" version="$VERSION" onConclusion="none">sdz-agent-component.pkg</pkg-ref>
</installer-gui-script>
XML
cp "$ROOT/LICENSE" "$STAGE/LICENSE"

SIGN_ARGS=()
[ -n "${SIGN_IDENTITY:-}" ] && SIGN_ARGS=(--sign "$SIGN_IDENTITY")

productbuild \
  --distribution "$STAGE/distribution.xml" \
  --resources "$STAGE" \
  --package-path "$STAGE" \
  "${SIGN_ARGS[@]}" \
  "$PRODUCT"

if [ -n "${NOTARY_PROFILE:-}" ]; then
  xcrun notarytool submit "$PRODUCT" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$PRODUCT"
fi

echo "built: $PRODUCT"
