#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SINGLE_DEPLOY_SCRIPT="${SCRIPT_DIR}/deploy-pia-http-proxy.sh"

usage() {
  cat <<'EOF'
Usage:
  deploy-pia-proxy-fleet.sh --csv /path/to/accounts.csv --start-port 3200

CSV format (header required):
  pia_user,pia_pass,region,instances

Example row:
  p1234567,secret123,"US East",20

What it does:
  - Creates N containers per account row
  - Enforces max 20 instances per account row
  - Creates unique proxy credentials per container
  - Allocates sequential ports from --start-port
EOF
}

CSV=""
START_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --csv) CSV="$2"; shift 2 ;;
    --start-port) START_PORT="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$CSV" || -z "$START_PORT" ]]; then
  usage
  exit 1
fi

if [[ ! -f "$CSV" ]]; then
  echo "CSV file not found: $CSV" >&2
  exit 1
fi

if ! [[ "$START_PORT" =~ ^[0-9]+$ ]]; then
  echo "--start-port must be numeric" >&2
  exit 1
fi

port="$START_PORT"
line_no=0

while IFS=, read -r pia_user pia_pass region instances; do
  line_no=$((line_no + 1))

  if [[ "$line_no" -eq 1 ]]; then
    continue
  fi

  pia_user="${pia_user//\"/}"
  pia_pass="${pia_pass//\"/}"
  region="${region//\"/}"
  instances="${instances//\"/}"

  if [[ -z "$pia_user" || -z "$pia_pass" || -z "$instances" ]]; then
    echo "Skipping line ${line_no}: missing required fields"
    continue
  fi

  if ! [[ "$instances" =~ ^[0-9]+$ ]]; then
    echo "Skipping line ${line_no}: instances is not numeric"
    continue
  fi

  if (( instances > 20 )); then
    echo "Skipping line ${line_no}: instances (${instances}) exceeds 20 per account"
    continue
  fi

  for ((i=1; i<=instances; i++)); do
    suffix=$(printf "%02d" "$i")
    container_name="pia-proxy-${pia_user}-${suffix}"
    proxy_user="proxy_${pia_user}_${suffix}"
    proxy_pass=$(tr -dc 'A-Za-z0-9' </dev/urandom | head -c 24)

    if [[ -n "$region" ]]; then
      "${SINGLE_DEPLOY_SCRIPT}" \
        --name "$container_name" \
        --pia-user "$pia_user" \
        --pia-pass "$pia_pass" \
        --proxy-user "$proxy_user" \
        --proxy-pass "$proxy_pass" \
        --port "$port" \
        --region "$region"
    else
      "${SINGLE_DEPLOY_SCRIPT}" \
        --name "$container_name" \
        --pia-user "$pia_user" \
        --pia-pass "$pia_pass" \
        --proxy-user "$proxy_user" \
        --proxy-pass "$proxy_pass" \
        --port "$port"
    fi

    echo "${container_name},${proxy_user},${proxy_pass},${port}"
    port=$((port + 1))
  done
done < "$CSV"
