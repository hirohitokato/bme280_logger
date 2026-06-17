#!/bin/sh
set -eu

APP_DIR="/home/pi/measure_app"
SERVICE_SRC="$APP_DIR/systemd/measure-app.service"
TIMER_SRC="$APP_DIR/systemd/measure-app.timer"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run with sudo: sudo ./install.sh" >&2
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo "Expected app directory not found: $APP_DIR" >&2
  echo "Copy this project to /home/pi/measure_app first." >&2
  exit 1
fi

chmod +x "$APP_DIR/main.py"
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
chown -R pi:pi "$APP_DIR"

cp "$SERVICE_SRC" /etc/systemd/system/measure-app.service
cp "$TIMER_SRC" /etc/systemd/system/measure-app.timer

systemctl daemon-reload
systemctl enable --now measure-app.timer

echo "Installed and started measure-app.timer"
echo "Check timer: systemctl list-timers --all | grep measure-app"
echo "Check service logs: journalctl -u measure-app.service -n 50 --no-pager"
