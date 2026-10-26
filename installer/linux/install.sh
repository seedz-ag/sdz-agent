#!/usr/bin/env bash
# sdz-agent bootstrap installer for Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/seedz-ag/sdz-agent-dotnet/main/installer/linux/install.sh | sudo bash
#   curl -fsSL .../install.sh | sudo bash -s -- --client-id ID --client-secret SECRET
#   SDZ_CLIENT_ID=ID SDZ_CLIENT_SECRET=SECRET curl -fsSL .../install.sh | sudo -E bash   (secret fora do histórico/ps)
#   curl -fsSL .../install.sh | sudo bash -s -- --version 3.0.0
#
# Detects deb/rpm and the CPU architecture, downloads the matching package from
# the GitHub Releases of seedz-ag/sdz-agent-dotnet, installs it and, when
# credentials are given, configures and starts the service.
set -euo pipefail

# ---- release location (change here if packages move to S3/CDN) ----
GITHUB_REPO="${SDZ_AGENT_REPO:-seedz-ag/sdz-agent-dotnet}"
RELEASE_BASE="${SDZ_AGENT_RELEASE_BASE:-https://github.com/${GITHUB_REPO}/releases}"
# asset name pattern: sdz-agent_<version>_<arch>.deb | sdz-agent-<version>-1.<rpmarch>.rpm

VERSION="latest"
CLIENT_ID="${SDZ_CLIENT_ID:-}"
CLIENT_SECRET="${SDZ_CLIENT_SECRET:-}"
API_URL="${SDZ_API_URL:-}"

usage() {
  cat <<USAGE
Usage: install.sh [--version X.Y.Z] [--client-id ID --client-secret SECRET [--api-url URL]]
       env SDZ_CLIENT_ID / SDZ_CLIENT_SECRET / SDZ_API_URL are honoured as well (sudo -E)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --client-id) CLIENT_ID="$2"; shift 2 ;;
    --client-secret) CLIENT_SECRET="$2"; shift 2 ;;
    --api-url) API_URL="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "unknown option: $1"; usage; exit 1 ;;
  esac
done

if [ "$(id -u)" -ne 0 ]; then
  echo "This installer must run as root (use sudo)." >&2
  exit 1
fi

for tool in curl; do
  command -v "$tool" >/dev/null 2>&1 || { echo "missing dependency: $tool" >&2; exit 1; }
done

# ---- package type ----
if command -v dpkg >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
  PKG=deb
elif command -v rpm >/dev/null 2>&1; then
  PKG=rpm
else
  echo "Unsupported distribution: neither dpkg nor rpm found." >&2
  exit 1
fi

# ---- architecture ----
case "$(uname -m)" in
  x86_64|amd64) DEB_ARCH=amd64; RPM_ARCH=x86_64 ;;
  aarch64|arm64) DEB_ARCH=arm64; RPM_ARCH=aarch64 ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# ---- resolve version ----
if [ "$VERSION" = "latest" ]; then
  VERSION="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
    | grep -m1 '"tag_name"' | sed -E 's/.*"v?([^"]+)".*/\1/')"
  [ -n "$VERSION" ] || { echo "Could not resolve the latest version." >&2; exit 1; }
fi

if [ "$PKG" = deb ]; then
  ASSET="sdz-agent_${VERSION}_${DEB_ARCH}.deb"
else
  ASSET="sdz-agent-${VERSION}-1.${RPM_ARCH}.rpm"
fi
URL="${RELEASE_BASE}/download/v${VERSION}/${ASSET}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading ${URL}"
curl -fL --progress-bar -o "${TMP}/${ASSET}" "$URL"

# optional integrity check against the published manifest
if curl -fsSL -o "${TMP}/manifest.json" "${RELEASE_BASE}/download/v${VERSION}/manifest.json" 2>/dev/null; then
  KEY="linux-$([ "$DEB_ARCH" = amd64 ] && echo x64 || echo arm64)-${PKG}"
  EXPECTED="$(grep -A3 "\"${KEY}\"" "${TMP}/manifest.json" | grep -m1 '"sha256"' | sed -E 's/.*"sha256": *"([0-9a-f]+)".*/\1/' || true)"
  if [ -n "$EXPECTED" ]; then
    ACTUAL="$(sha256sum "${TMP}/${ASSET}" | cut -d' ' -f1)"
    if [ "$EXPECTED" != "$ACTUAL" ]; then
      echo "Checksum mismatch for ${ASSET} (expected ${EXPECTED}, got ${ACTUAL})." >&2
      exit 1
    fi
    echo "Checksum OK."
  fi
fi

echo "Installing ${ASSET}"
if [ "$PKG" = deb ]; then
  apt-get install -y "${TMP}/${ASSET}" || { dpkg -i "${TMP}/${ASSET}" && apt-get install -f -y; }
else
  if command -v dnf >/dev/null 2>&1; then dnf install -y "${TMP}/${ASSET}"
  elif command -v yum >/dev/null 2>&1; then yum install -y "${TMP}/${ASSET}"
  else rpm -Uvh "${TMP}/${ASSET}"; fi
fi

if [ -n "$CLIENT_ID" ] && [ -n "$CLIENT_SECRET" ]; then
  echo "Configuring credentials"
  # the secret goes through stdin (not argv) and the running service applies it at once
  ARGS=(credentials set --client-id "$CLIENT_ID" --client-secret-stdin --non-interactive)
  [ -n "$API_URL" ] && ARGS+=(--api-url "$API_URL")
  printf '%s\n' "$CLIENT_SECRET" | /opt/sdz-agent/sdz-agent "${ARGS[@]}"
  /opt/sdz-agent/sdz-agent status || true
else
  echo ""
  echo "Installed. Finish the setup with:"
  echo "  sudo sdz-agent credentials set        # or the tray icon"
fi
