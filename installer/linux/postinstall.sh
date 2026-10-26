#!/bin/sh
# nfpm postinstall: runs after the files are unpacked (deb: configure / rpm: %post).
set -e

DATA_DIR=/var/lib/sdz-agent
GROUP=sdz-agent

mkdir -p "$DATA_DIR/output" "$DATA_DIR/logs"
chmod 750 "$DATA_DIR" "$DATA_DIR/output" "$DATA_DIR/logs"

# Group that may talk to the service through /run/sdz-agent/control.sock (tray app, `sdz-agent status`).
if ! getent group "$GROUP" >/dev/null 2>&1; then
  groupadd --system "$GROUP" || true
fi
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  if ! id -nG "$SUDO_USER" 2>/dev/null | tr ' ' '\n' | grep -qx "$GROUP"; then
    usermod -aG "$GROUP" "$SUDO_USER" || true
    echo "sdz-agent: user $SUDO_USER added to group $GROUP (log out and back in so the tray app can configure the agent)."
  fi
fi

# refresh the desktop icon/menu caches when available (tray app .desktop + icon)
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
command -v gtk-update-icon-cache >/dev/null 2>&1 && gtk-update-icon-cache -q /usr/share/icons/hicolor || true

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable sdz-agent.service >/dev/null 2>&1 || true
  # the service runs unconfigured (idles) until credentials arrive through the tray app or `sdz-agent configure`
  systemctl restart sdz-agent.service || true

  if [ -f "$DATA_DIR/.env" ]; then
    echo "sdz-agent: service restarted (configuration found at $DATA_DIR/.env)."
  else
    echo ""
    echo "sdz-agent installed and running, waiting for credentials."
    echo "Configure pelo ícone na bandeja (SDZ Agent) ou pelo terminal:"
    echo "  sudo sdz-agent credentials set                      # interativo (secret sem eco)"
    echo "  sudo sdz-agent credentials set --client-id <ID> --client-secret <SECRET> --non-interactive"
    echo "  sudo sdz-agent credentials show | test | clear      # ver (secret mascarado), validar, remover"
    echo ""
  fi
else
  echo "sdz-agent: systemd not found; start it manually with: sdz-agent run"
fi

exit 0
