#!/bin/sh
set -eu

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo ./uninstall.sh" >&2
  exit 1
fi

systemctl disable --now measure-app.timer 2>/dev/null || true
rm -f /etc/systemd/system/measure-app.service
rm -f /etc/systemd/system/measure-app.timer
systemctl daemon-reload

echo "Uninstalled measure-app systemd units."
echo "Application files and SQLite DB were not deleted."
