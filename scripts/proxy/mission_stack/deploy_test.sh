#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
CSV_PATH="${CSV_PATH:-$ROOT_DIR/scripts/proxy/pia-accounts-inventory.csv}"

US_START_INDEX="${US_START_INDEX:-1}"
LATAM_START_INDEX="${LATAM_START_INDEX:-2}"
EU_START_INDEX="${EU_START_INDEX:-3}"

TUNNELS_PER_BOX="${TUNNELS_PER_BOX:-1}"
FIXED_PROXY_PASS="${FIXED_PROXY_PASS:-x0}"

US_BASE_PORT="${US_BASE_PORT:-3128}"
LATAM_BASE_PORT="${LATAM_BASE_PORT:-4128}"
EU_BASE_PORT="${EU_BASE_PORT:-5128}"

US_PREFIX="${US_PREFIX:-test-us}"
LATAM_PREFIX="${LATAM_PREFIX:-test-latam}"
EU_PREFIX="${EU_PREFIX:-test-eu}"

LATAM_SERVER_NAME="${LATAM_SERVER_NAME:-mexico414}"
EU_SERVER_NAME="${EU_SERVER_NAME:-madrid401}"

POOLS_FILE="$ROOT_DIR/scripts/proxy/mission_stack/pools-test.txt"

echo "[test] CSV=$CSV_PATH"

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$US_START_INDEX" \
  --boxes 1 \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$US_BASE_PORT" \
  --project-prefix "$US_PREFIX" \
  --proxy-prefix-template 'tus{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode country \
  --mode-value "United States" \
  --heal \
  --auto-continue

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$LATAM_START_INDEX" \
  --boxes 1 \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$LATAM_BASE_PORT" \
  --project-prefix "$LATAM_PREFIX" \
  --proxy-prefix-template 'tla{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode server_names \
  --mode-value "$LATAM_SERVER_NAME" \
  --heal \
  --auto-continue

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$EU_START_INDEX" \
  --boxes 1 \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$EU_BASE_PORT" \
  --project-prefix "$EU_PREFIX" \
  --proxy-prefix-template 'teu{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode server_names \
  --mode-value "$EU_SERVER_NAME" \
  --heal \
  --auto-continue

{
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${US_PREFIX}-"* 2>/dev/null || true
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${LATAM_PREFIX}-"* 2>/dev/null || true
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${EU_PREFIX}-"* 2>/dev/null || true
} | xargs -r -n1 basename | sort -u > "$POOLS_FILE"

echo "[test] pools file generated: $POOLS_FILE"
cat "$POOLS_FILE"
