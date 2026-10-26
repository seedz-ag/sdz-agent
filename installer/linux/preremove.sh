#!/bin/sh
# nfpm preremove: stop and disable the service before files are removed.
# On upgrades (deb: "upgrade" / rpm: $1 >= 1) the service is kept enabled;
# postinstall of the new version restarts it.
set -e

if command -v systemctl >/dev/null 2>&1; then
  case "$1" in
    upgrade|1|2)
      systemctl stop sdz-agent.service >/dev/null 2>&1 || true
      ;;
    *)
      systemctl stop sdz-agent.service >/dev/null 2>&1 || true
      systemctl disable sdz-agent.service >/dev/null 2>&1 || true
      ;;
  esac
fi

exit 0
