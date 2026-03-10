#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="${HOME}/.config/opencode"
mkdir -p "$CONFIG_DIR"

if [ -z "${OPENCODE_SERVER_PASSWORD:-}" ]; then
  echo "ERROR: OPENCODE_SERVER_PASSWORD is required"
  exit 1
fi

cat > "$CONFIG_DIR/opencode.json" <<'JSON'
{
  "$schema": "https://opencode.ai/config.json",
  "model": "{env:OPENCODE_MODEL}",
  "server": {
    "hostname": "{env:OPENCODE_SERVER_HOSTNAME}",
    "port": 4096
  },
  "mcp": {
    "tavily": {
      "type": "remote",
      "url": "https://mcp.tavily.com/mcp/?tavilyApiKey={env:TAVILY_API_KEY}",
      "oauth": false,
      "enabled": true
    }
  }
}
JSON

export OPENCODE_SERVER_USERNAME
export OPENCODE_SERVER_PASSWORD

exec opencode serve --hostname "${OPENCODE_SERVER_HOSTNAME:-0.0.0.0}" --port "${OPENCODE_SERVER_PORT:-4096}"
