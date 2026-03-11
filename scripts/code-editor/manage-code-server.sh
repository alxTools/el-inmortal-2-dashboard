#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/scripts/code-editor/docker-compose.code-server.yml"
ACTION="${1:-status}"
CONTAINER_NAME="${CODE_EDITOR_CONTAINER_NAME:-ei2-code-server}"

export DASHBOARD_CODE_EDITOR_ROOT="${DASHBOARD_CODE_EDITOR_ROOT:-$ROOT_DIR}"
export CODE_EDITOR_PORT="${CODE_EDITOR_PORT:-13337}"
export CODE_EDITOR_CONTAINER_NAME="$CONTAINER_NAME"

if ! command -v docker >/dev/null 2>&1; then
    echo "docker_not_found"
    exit 1
fi

if [[ ! -f "$COMPOSE_FILE" ]]; then
    echo "compose_file_missing: $COMPOSE_FILE"
    exit 1
fi

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "docker_compose_not_found"
    exit 1
fi

run_compose() {
    "${COMPOSE_CMD[@]}" -f "$COMPOSE_FILE" "$@"
}

case "$ACTION" in
    start)
        run_compose up -d
        ;;
    restart)
        run_compose up -d --force-recreate
        ;;
    stop)
        run_compose stop
        ;;
    down)
        run_compose down
        ;;
    logs)
        run_compose logs -f "${2:-code-server}"
        ;;
    status)
        docker ps -a --filter "name=^/${CONTAINER_NAME}$" --format '{{.Names}}|{{.State}}|{{.Status}}'
        ;;
    *)
        echo "usage: $0 [start|restart|stop|down|status|logs]"
        exit 1
        ;;
esac
