#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
POOLS_FILE="${POOLS_FILE:-$ROOT_DIR/scripts/proxy/mission_stack/pools-full.txt}"
INTERVAL="${INTERVAL:-180}"
WORKERS="${WORKERS:-8}"
TIMEOUT="${TIMEOUT:-12}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --pools-file)
      POOLS_FILE="$2"
      shift 2
      ;;
    --interval)
      INTERVAL="$2"
      shift 2
      ;;
    --workers)
      WORKERS="$2"
      shift 2
      ;;
    --timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown flag: $1" >&2
      exit 1
      ;;
  esac
done

echo "[healer] pools_file=$POOLS_FILE interval=${INTERVAL}s workers=$WORKERS timeout=$TIMEOUT"

while true; do
  date -u '+[healer] %Y-%m-%dT%H:%M:%SZ cycle start'

  if [[ ! -f "$POOLS_FILE" ]]; then
    echo "[healer] pools file missing, sleeping..."
    sleep "$INTERVAL"
    continue
  fi

  while IFS= read -r pool || [[ -n "$pool" ]]; do
    [[ -z "$pool" ]] && continue
    input_csv="$ROOT_DIR/scripts/proxy/generated/$pool/proxy-credentials.csv"

    if [[ ! -f "$input_csv" ]]; then
      echo "[healer] skip missing credentials: $input_csv"
      continue
    fi

    echo "[healer] checking pool=$pool"
    python3 "$ROOT_DIR/scripts/proxy/check_proxy_pool.py" \
      --input "$input_csv" \
      --workers "$WORKERS" \
      --timeout "$TIMEOUT" \
      --heal || true
  done < "$POOLS_FILE"

  date -u '+[healer] %Y-%m-%dT%H:%M:%SZ cycle end'
  sleep "$INTERVAL"
done
