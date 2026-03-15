#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${1:-${SCRIPT_DIR}/.env.worker}"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.worker.yml"
SERVICE_NAME="opencode-worker.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

if [[ "${ENV_FILE}" != /* ]]; then
  ENV_FILE="$(cd "$(dirname "${ENV_FILE}")" && pwd)/$(basename "${ENV_FILE}")"
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing env file: ${ENV_FILE}" >&2
  echo "Copy ${SCRIPT_DIR}/.env.worker.example to ${SCRIPT_DIR}/.env.worker and edit credentials." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found in PATH" >&2
  exit 1
fi

DOCKER_BIN="$(command -v docker)"

if ! "${DOCKER_BIN}" compose version >/dev/null 2>&1; then
  echo "docker compose plugin not available" >&2
  exit 1
fi

if [[ ! -f "${COMPOSE_FILE}" ]]; then
  echo "Compose file not found: ${COMPOSE_FILE}" >&2
  exit 1
fi

sudo tee "${SERVICE_PATH}" >/dev/null <<EOF
[Unit]
Description=OpenCode worker service (Docker Compose)
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=${SCRIPT_DIR}
EnvironmentFile=${ENV_FILE}
ExecStart=${DOCKER_BIN} compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} up -d
ExecStop=${DOCKER_BIN} compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} down
ExecReload=${DOCKER_BIN} compose --env-file ${ENV_FILE} -f ${COMPOSE_FILE} up -d
TimeoutStartSec=0
TimeoutStopSec=120

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now "${SERVICE_NAME}"

echo "Installed and started: ${SERVICE_NAME}"
echo "Check status: sudo systemctl status ${SERVICE_NAME} --no-pager"
echo "Tail logs: docker logs -f opencode-worker"
