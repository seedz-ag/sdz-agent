#!/bin/sh
# nfpm postremove: reload systemd after the unit file is gone.
# Data in /var/lib/sdz-agent (.env, logs, output) is intentionally kept so a
# re-install picks the configuration up again. Remove it manually if needed.
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload >/dev/null 2>&1 || true
fi
command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database -q /usr/share/applications || true
# deb purge / rpm final erase: drop the control group as well
case "$1" in
  purge|0)
    getent group sdz-agent >/dev/null 2>&1 && groupdel sdz-agent >/dev/null 2>&1 || true
    ;;
esac
exit 0
