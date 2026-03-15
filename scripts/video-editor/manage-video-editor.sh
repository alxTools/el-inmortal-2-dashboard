#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
STACK_DIR="$ROOT_DIR/scripts/video-editor"
REPO_DIR="${VIDEO_EDITOR_REPO_DIR:-$STACK_DIR/videoeditor}"
COMPOSE_FILE="${VIDEO_EDITOR_COMPOSE_FILE:-$STACK_DIR/docker-compose.video-editor.yml}"
ENV_FILE="${VIDEO_EDITOR_ENV_FILE:-$REPO_DIR/.env.ei2}"

REPO_URL="${VIDEO_EDITOR_REPO_URL:-https://github.com/trykimu/videoeditor.git}"
REPO_BRANCH="${VIDEO_EDITOR_REPO_BRANCH:-main}"
PROJECT_NAME="${VIDEO_EDITOR_PROJECT_NAME:-ei2-video-editor}"

VIDEO_EDITOR_BASENAME="${VIDEO_EDITOR_BASENAME:-/tools/remotion-studio/ide}"
VIDEO_EDITOR_PUBLIC_HOST="${VIDEO_EDITOR_PUBLIC_HOST:-ei2.galantealx.com}"
VIDEO_EDITOR_PUBLIC_BASE_URL="${VIDEO_EDITOR_PUBLIC_BASE_URL:-https://$VIDEO_EDITOR_PUBLIC_HOST$VIDEO_EDITOR_BASENAME}"
VIDEO_EDITOR_AUTH_TRUSTED_ORIGINS="${VIDEO_EDITOR_AUTH_TRUSTED_ORIGINS:-https://$VIDEO_EDITOR_PUBLIC_HOST}"
VIDEO_EDITOR_AUTH_COOKIE_DOMAIN="${VIDEO_EDITOR_AUTH_COOKIE_DOMAIN:-}"

VIDEO_EDITOR_FRONTEND_PORT="${VIDEO_EDITOR_FRONTEND_PORT:-15173}"
VIDEO_EDITOR_RENDER_PORT="${VIDEO_EDITOR_RENDER_PORT:-18000}"
VIDEO_EDITOR_FASTAPI_PORT="${VIDEO_EDITOR_FASTAPI_PORT:-13000}"

VIDEO_EDITOR_POSTGRES_DB="${VIDEO_EDITOR_POSTGRES_DB:-videoeditor}"
VIDEO_EDITOR_POSTGRES_USER="${VIDEO_EDITOR_POSTGRES_USER:-videoeditor}"
VIDEO_EDITOR_POSTGRES_PASSWORD="${VIDEO_EDITOR_POSTGRES_PASSWORD:-videoeditor}"
VIDEO_EDITOR_DATABASE_URL="${DATABASE_URL:-postgresql://$VIDEO_EDITOR_POSTGRES_USER:$VIDEO_EDITOR_POSTGRES_PASSWORD@ei2-video-editor-postgres:5432/$VIDEO_EDITOR_POSTGRES_DB}"

VIDEO_EDITOR_GOOGLE_CLIENT_ID="${GOOGLE_CLIENT_ID:-dummy-google-client-id}"
VIDEO_EDITOR_GOOGLE_CLIENT_SECRET="${GOOGLE_CLIENT_SECRET:-dummy-google-client-secret}"
VIDEO_EDITOR_BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-ei2-video-editor-local-secret-change-me}"
VIDEO_EDITOR_GEMINI_API_KEY="${GEMINI_API_KEY:-dummy-gemini-api-key}"

DOCKER_COMPOSE_CMD=()

detect_compose_cmd() {
    if docker compose version >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker compose)
        return
    fi

    if command -v docker-compose >/dev/null 2>&1; then
        DOCKER_COMPOSE_CMD=(docker-compose)
        return
    fi

    echo "docker compose or docker-compose is required" >&2
    exit 1
}

compose_stack() {
    "${DOCKER_COMPOSE_CMD[@]}" \
        --project-name "$PROJECT_NAME" \
        -f "$COMPOSE_FILE" \
        --env-file "$ENV_FILE" \
        "$@"
}

ensure_repo() {
    mkdir -p "$STACK_DIR"

    if [[ ! -d "$REPO_DIR/.git" ]]; then
        git clone --depth 1 --branch "$REPO_BRANCH" "$REPO_URL" "$REPO_DIR"
        return
    fi

    git -C "$REPO_DIR" fetch --depth 1 origin "$REPO_BRANCH" >/dev/null 2>&1 || true
    git -C "$REPO_DIR" checkout "$REPO_BRANCH" >/dev/null 2>&1 || true
    git -C "$REPO_DIR" pull --ff-only origin "$REPO_BRANCH" >/dev/null 2>&1 || true
}

apply_local_overrides() {
    cat >"$REPO_DIR/react-router.config.ts" <<EOF
import type { Config } from "@react-router/dev/config";

const rawBase = process.env.VIDEO_EDITOR_BASENAME || "$VIDEO_EDITOR_BASENAME";
const normalizedBase = rawBase.startsWith("/") ? rawBase : "/\${rawBase}";

export default {
  ssr: true,
  basename: normalizedBase,
  routeDiscovery: { mode: "initial" },
} satisfies Config;
EOF

    cat >"$REPO_DIR/vite.config.ts" <<EOF
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const rawBase = process.env.VIDEO_EDITOR_BASENAME || "$VIDEO_EDITOR_BASENAME";
const normalizedBase = (rawBase.endsWith("/") ? rawBase : rawBase + "/") || "/";

export default defineConfig({
  base: normalizedBase,
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
EOF
}

ensure_env_value() {
    local key="$1"
    local value="$2"

    if grep -q "^\${key}=" "$ENV_FILE"; then
        return
    fi

    printf "%s=%s\n" "$key" "$value" >> "$ENV_FILE"
}

ensure_env_file() {
    mkdir -p "$REPO_DIR"
    touch "$ENV_FILE"

    ensure_env_value "NODE_ENV" "production"
    ensure_env_value "VITE_SUPABASE_URL" ""
    ensure_env_value "VITE_SUPABASE_ANON_KEY" ""
    ensure_env_value "DATABASE_URL" "$VIDEO_EDITOR_DATABASE_URL"
    ensure_env_value "GOOGLE_CLIENT_ID" "$VIDEO_EDITOR_GOOGLE_CLIENT_ID"
    ensure_env_value "GOOGLE_CLIENT_SECRET" "$VIDEO_EDITOR_GOOGLE_CLIENT_SECRET"
    ensure_env_value "BETTER_AUTH_SECRET" "$VIDEO_EDITOR_BETTER_AUTH_SECRET"
    ensure_env_value "GEMINI_API_KEY" "$VIDEO_EDITOR_GEMINI_API_KEY"
    ensure_env_value "PROD_DOMAIN" "$VIDEO_EDITOR_PUBLIC_HOST"
    ensure_env_value "VIDEO_EDITOR_PUBLIC_HOST" "$VIDEO_EDITOR_PUBLIC_HOST"
    ensure_env_value "VIDEO_EDITOR_PUBLIC_BASE_URL" "$VIDEO_EDITOR_PUBLIC_BASE_URL"
    ensure_env_value "VIDEO_EDITOR_AUTH_TRUSTED_ORIGINS" "$VIDEO_EDITOR_AUTH_TRUSTED_ORIGINS"
    ensure_env_value "VIDEO_EDITOR_AUTH_COOKIE_DOMAIN" "${VIDEO_EDITOR_AUTH_COOKIE_DOMAIN:-}"
    ensure_env_value "VIDEO_EDITOR_AUTH_BYPASS" "true"
    ensure_env_value "VIDEO_EDITOR_BYPASS_USER_ID" "ei2-local-editor"
    ensure_env_value "VITE_VIDEO_EDITOR_AUTH_BYPASS" "true"
    ensure_env_value "VITE_VIDEO_EDITOR_BYPASS_USER_ID" "ei2-local-editor"
    ensure_env_value "VITE_VIDEO_EDITOR_BYPASS_USER_NAME" "EI2 Editor"
    ensure_env_value "VITE_VIDEO_EDITOR_BYPASS_USER_EMAIL" "editor@ei2.local"
    ensure_env_value "VIDEO_EDITOR_BASENAME" "$VIDEO_EDITOR_BASENAME"
    ensure_env_value "VIDEO_EDITOR_FRONTEND_PORT" "$VIDEO_EDITOR_FRONTEND_PORT"
    ensure_env_value "VIDEO_EDITOR_RENDER_PORT" "$VIDEO_EDITOR_RENDER_PORT"
    ensure_env_value "VIDEO_EDITOR_FASTAPI_PORT" "$VIDEO_EDITOR_FASTAPI_PORT"
    ensure_env_value "VIDEO_EDITOR_POSTGRES_DB" "$VIDEO_EDITOR_POSTGRES_DB"
    ensure_env_value "VIDEO_EDITOR_POSTGRES_USER" "$VIDEO_EDITOR_POSTGRES_USER"
    ensure_env_value "VIDEO_EDITOR_POSTGRES_PASSWORD" "$VIDEO_EDITOR_POSTGRES_PASSWORD"
}

wait_for_frontend() {
    local timeout_seconds="${1:-240}"
    local started_at="$(date +%s)"

    while true; do
        if curl -sS --max-time 4 "http://127.0.0.1:${VIDEO_EDITOR_FRONTEND_PORT}/" >/dev/null 2>&1; then
            return
        fi

        local now="$(date +%s)"
        if (( now - started_at >= timeout_seconds )); then
            echo "video editor frontend did not become ready in time" >&2
            return 1
        fi

        sleep 2
    done
}

run_migrations() {
    compose_stack exec -T frontend pnpm run migrate >/dev/null 2>&1 || true
}

container_state_line() {
    local container_name="$1"
    docker ps -a \
        --filter "name=${container_name}" \
        --format "{{.State}}|{{.Status}}" \
        | awk 'NR==1 { print; exit }'
}

print_status() {
    local frontend_line
    local render_line
    local fastapi_line

    frontend_line="$(container_state_line "ei2-video-editor-frontend")"
    render_line="$(container_state_line "ei2-video-editor-render")"
    fastapi_line="$(container_state_line "ei2-video-editor-fastapi")"

    echo "video editor stack status"
    echo "frontend: ${frontend_line:-missing}"
    echo "render:   ${render_line:-missing}"
    echo "fastapi:  ${fastapi_line:-missing}"
    echo "frontend_url=http://127.0.0.1:${VIDEO_EDITOR_FRONTEND_PORT}"
}

cmd_start() {
    detect_compose_cmd
    ensure_repo
    apply_local_overrides
    ensure_env_file

    compose_stack up -d --build
    wait_for_frontend 300 || true
    run_migrations
    print_status
}

cmd_stop() {
    detect_compose_cmd
    if [[ -f "$COMPOSE_FILE" ]]; then
        compose_stack down
    fi
    print_status
}

cmd_restart() {
    cmd_stop
    cmd_start
}

cmd_status() {
    detect_compose_cmd
    print_status
}

cmd_logs() {
    detect_compose_cmd
    compose_stack logs --tail 200
}

cmd_update() {
    detect_compose_cmd
    ensure_repo
    apply_local_overrides
    ensure_env_file
    compose_stack up -d --build
    print_status
}

main() {
    local action="${1:-status}"
    case "$action" in
        start) cmd_start ;;
        stop) cmd_stop ;;
        restart) cmd_restart ;;
        status) cmd_status ;;
        logs) cmd_logs ;;
        update) cmd_update ;;
        *)
            echo "usage: $0 {start|stop|restart|status|logs|update}" >&2
            exit 1
            ;;
    esac
}

main "$@"
