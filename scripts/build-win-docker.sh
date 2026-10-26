#!/usr/bin/env bash
# Cross-builds sdz-agent.exe + sdz-agent-tray.exe (Fyne, CGO via MinGW) for win-x64 inside Docker,
# so no Windows machine is needed. Output: artifacts/publish/win-x64/ (+ Mesa DLLs).
#   scripts/build-win-docker.sh            VERSION from the VERSION file
set -euo pipefail
cd "$(dirname "$0")/.."
VERSION="${VERSION:-$(tr -d '[:space:]' < VERSION)}"
IMAGE="${GO_WIN_IMAGE:-sdz-go-mingw}"
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker build -q -t "$IMAGE" - <<'DOCKER'
FROM golang:1.26-bookworm
RUN apt-get update -qq && apt-get install -y -qq gcc-mingw-w64-x86-64 >/dev/null && rm -rf /var/lib/apt/lists/* \
 && go install github.com/tc-hib/go-winres@latest
ENV PATH="/root/go/bin:${PATH}" GOFLAGS=-mod=mod
DOCKER
MODCACHE="$(go env GOMODCACHE 2>/dev/null || echo "$HOME/go/pkg/mod")"
docker run --rm -v "$PWD:/src" -v "$MODCACHE:/go/pkg/mod" -w /src -e VERSION="$VERSION" -e SKIP_MESA=1 -e GOTOOLCHAIN=auto "$IMAGE" \
  bash -c "git config --global --add safe.directory /src 2>/dev/null; scripts/build.sh win-x64"
docker run --rm -v "$PWD:/src" -w /src "$IMAGE" chown -R "$(id -u):$(id -g)" /src/artifacts/publish/win-x64 /src/cmd/sdz-agent-tray 2>/dev/null || true
scripts/fetch-mesa.sh artifacts/publish/win-x64
