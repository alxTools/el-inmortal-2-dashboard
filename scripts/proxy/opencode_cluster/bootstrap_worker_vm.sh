#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   sudo bash bootstrap_worker_vm.sh \
#     --tavily-api-key tvly-... \
#     --server-password mypass \
#     --image opencode-worker:latest

TAVILY_API_KEY=""
SERVER_PASSWORD=""
SERVER_USERNAME="opencode"
IMAGE="opencode-worker:latest"
PORT="4096"
MODEL="openai/gpt-5"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tavily-api-key)
      TAVILY_API_KEY="$2"
      shift 2
      ;;
    --server-password)
      SERVER_PASSWORD="$2"
      shift 2
      ;;
    --server-username)
      SERVER_USERNAME="$2"
      shift 2
      ;;
    --image)
      IMAGE="$2"
      shift 2
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --model)
      MODEL="$2"
      shift 2
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$SERVER_PASSWORD" ]]; then
  echo "--server-password is required" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  apt-get update
  apt-get install -y ca-certificates curl gnupg lsb-release
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable docker
  systemctl start docker
fi

mkdir -p /opt/opencode-worker/state /opt/opencode-worker/config

docker rm -f opencode-worker >/dev/null 2>&1 || true

docker run -d \
  --name opencode-worker \
  --restart unless-stopped \
  -p "${PORT}:4096" \
  -e OPENCODE_SERVER_USERNAME="${SERVER_USERNAME}" \
  -e OPENCODE_SERVER_PASSWORD="${SERVER_PASSWORD}" \
  -e TAVILY_API_KEY="${TAVILY_API_KEY}" \
  -e OPENCODE_MODEL="${MODEL}" \
  -v /opt/opencode-worker/state:/home/opencode/.local/share/opencode \
  -v /opt/opencode-worker/config:/home/opencode/.config/opencode \
  "${IMAGE}"

echo "Worker deployed on port ${PORT}"
echo "Health check: curl -u ${SERVER_USERNAME}:*** http://127.0.0.1:${PORT}/global/health"
