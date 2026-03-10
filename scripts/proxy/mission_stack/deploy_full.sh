#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="${ROOT_DIR:-/workspace}"
CSV_PATH="${CSV_PATH:-$ROOT_DIR/scripts/proxy/pia-accounts-inventory.csv}"

US_START_INDEX="${US_START_INDEX:-1}"
US_BOXES="${US_BOXES:-10}"
US_BASE_PORT="${US_BASE_PORT:-3128}"
US_PREFIX="${US_PREFIX:-pia15-us}"

LATAM_START_INDEX="${LATAM_START_INDEX:-11}"
LATAM_BOXES="${LATAM_BOXES:-6}"
LATAM_BASE_PORT="${LATAM_BASE_PORT:-6128}"
LATAM_PREFIX="${LATAM_PREFIX:-pia15-latam}"

EU_START_INDEX="${EU_START_INDEX:-17}"
EU_BOXES="${EU_BOXES:-4}"
EU_BASE_PORT="${EU_BASE_PORT:-8128}"
EU_PREFIX="${EU_PREFIX:-pia15-eu}"

TUNNELS_PER_BOX="${TUNNELS_PER_BOX:-15}"
FIXED_PROXY_PASS="${FIXED_PROXY_PASS:-x0}"

LATAM_SERVER_NAMES="${LATAM_SERVER_NAMES:-buenosaires410,bolivia401,saopaolo407,chile403,chile402,costarica403,ecuador402,guatemala401,mexico414,panama411,peru401,uruguay402,venezuela406,buenosaires409,mexico408}"
EU_SERVER_NAMES="${EU_SERVER_NAMES:-madrid401,madrid403,madrid404,paris415,amsterdam447,zurich408,vienna403,brussels424,paris414,warsaw414,lisbon405,amsterdam428,zurich407,oslo407,vienna401}"

POOLS_FILE="$ROOT_DIR/scripts/proxy/mission_stack/pools-full.txt"

echo "[full] CSV=$CSV_PATH"

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$US_START_INDEX" \
  --boxes "$US_BOXES" \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$US_BASE_PORT" \
  --project-prefix "$US_PREFIX" \
  --proxy-prefix-template 'vus{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode country \
  --mode-value "United States" \
  --heal \
  --auto-continue

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$LATAM_START_INDEX" \
  --boxes "$LATAM_BOXES" \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$LATAM_BASE_PORT" \
  --project-prefix "$LATAM_PREFIX" \
  --proxy-prefix-template 'vla{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode server_names \
  --mode-value "$LATAM_SERVER_NAMES" \
  --heal \
  --auto-continue

python3 "$ROOT_DIR/scripts/proxy/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index "$EU_START_INDEX" \
  --boxes "$EU_BOXES" \
  --tunnels-per-box "$TUNNELS_PER_BOX" \
  --first-base-port "$EU_BASE_PORT" \
  --project-prefix "$EU_PREFIX" \
  --proxy-prefix-template 'veu{n}' \
  --fixed-proxy-pass "$FIXED_PROXY_PASS" \
  --mode server_names \
  --mode-value "$EU_SERVER_NAMES" \
  --heal \
  --auto-continue

{
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${US_PREFIX}-"* 2>/dev/null || true
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${LATAM_PREFIX}-"* 2>/dev/null || true
  ls -1d "$ROOT_DIR/scripts/proxy/generated/${EU_PREFIX}-"* 2>/dev/null || true
} | xargs -r -n1 basename | sort -u > "$POOLS_FILE"

echo "[full] pools file generated: $POOLS_FILE"
cat "$POOLS_FILE"
