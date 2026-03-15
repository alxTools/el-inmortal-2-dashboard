#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="opencode-worker.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

sudo systemctl disable --now "${SERVICE_NAME}" >/dev/null 2>&1 || true
sudo rm -f "${SERVICE_PATH}"
sudo systemctl daemon-reload

echo "Removed ${SERVICE_NAME}"
