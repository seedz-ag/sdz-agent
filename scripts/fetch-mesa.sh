#!/usr/bin/env bash
# Downloads the Mesa3D software OpenGL (llvmpipe) DLLs for Windows x64 and drops them next to
# sdz-agent-tray.exe. The tray is built with Fyne, which needs OpenGL 2.0; VMs and RDP sessions
# usually expose only OpenGL 1.1, so without these DLLs the panel cannot open (and Fyne exits).
# Windows loads opengl32.dll from the application folder first, so no system change is needed.
#   scripts/fetch-mesa.sh [publish-dir]      (default artifacts/publish/win-x64)
# Source: https://github.com/pal1000/mesa-dist-win (Mesa is MIT licensed).
set -euo pipefail
cd "$(dirname "$0")/.."
MESA_VERSION="${MESA_VERSION:-26.2.4}"
MESA_SHA256="${MESA_SHA256:-351fc8c8b695878ffb3eaa044b3ead08672a48b1a045e3c3e3975811df0f6695}"
ARCHIVE="mesa3d-${MESA_VERSION}-release-msvc.7z"
URL="https://github.com/pal1000/mesa-dist-win/releases/download/${MESA_VERSION}/${ARCHIVE}"
OUT="${1:-artifacts/publish/win-x64}"
CACHE="artifacts/mesa"
FILES=(opengl32.dll libgallium_wgl.dll dxil.dll)

mkdir -p "$OUT" "$CACHE"
if [ -f "$CACHE/$MESA_VERSION/x64/opengl32.dll" ]; then
  echo "mesa $MESA_VERSION already extracted in $CACHE/$MESA_VERSION"
else
  [ -f "$CACHE/$ARCHIVE" ] || curl -fL --progress-bar -o "$CACHE/$ARCHIVE" "$URL"
  echo "$MESA_SHA256  $CACHE/$ARCHIVE" | sha256sum -c -
  mkdir -p "$CACHE/$MESA_VERSION"
  if command -v 7z >/dev/null 2>&1; then
    7z x -y -o"$CACHE/$MESA_VERSION" "$CACHE/$ARCHIVE" x64/opengl32.dll x64/libgallium_wgl.dll x64/dxil.dll >/dev/null
  else
    docker run --rm --user "$(id -u):$(id -g)" -v "$PWD/$CACHE:/m" -w /m debian:bookworm-slim bash -c \
      "apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq p7zip-full >/dev/null 2>&1; 7z x -y -o/m/$MESA_VERSION /m/$ARCHIVE x64/opengl32.dll x64/libgallium_wgl.dll x64/dxil.dll >/dev/null" 2>/dev/null \
    || docker run --rm -v "$PWD/$CACHE:/m" -w /m debian:bookworm-slim bash -c \
      "apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq p7zip-full >/dev/null 2>&1; 7z x -y -o/m/$MESA_VERSION /m/$ARCHIVE x64/opengl32.dll x64/libgallium_wgl.dll x64/dxil.dll >/dev/null; chown -R $(id -u):$(id -g) /m/$MESA_VERSION"
  fi
fi
for f in "${FILES[@]}"; do cp -f "$CACHE/$MESA_VERSION/x64/$f" "$OUT/$f"; done
cp -f installer/windows/MESA-LICENSE.txt "$OUT/MESA-LICENSE.txt"
ls -la "$OUT"/{opengl32,libgallium_wgl,dxil}.dll | awk '{print $5, $9}'
