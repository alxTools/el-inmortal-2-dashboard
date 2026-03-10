#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CSV_PATH="${1:-$SCRIPT_DIR/pia-accounts-inventory.csv}"

if [[ ! -f "$CSV_PATH" ]]; then
  echo "CSV not found: $CSV_PATH" >&2
  exit 1
fi

echo "Using credentials CSV: $CSV_PATH"

echo "[1/3] Deploying US pool (10 boxes)..."
python3 "$SCRIPT_DIR/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index 1 \
  --boxes 10 \
  --tunnels-per-box 15 \
  --first-base-port 3128 \
  --project-prefix pia15-us \
  --proxy-prefix-template 'vus{n}' \
  --fixed-proxy-pass x0 \
  --mode country \
  --mode-value "United States" \
  --heal \
  --auto-continue

echo "[2/3] Deploying LATAM pool (6 boxes)..."
python3 "$SCRIPT_DIR/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index 11 \
  --boxes 6 \
  --tunnels-per-box 15 \
  --first-base-port 6128 \
  --project-prefix pia15-latam \
  --proxy-prefix-template 'vla{n}' \
  --fixed-proxy-pass x0 \
  --mode server_names \
  --mode-value "buenosaires410,bolivia401,saopaolo407,chile403,chile402,costarica403,ecuador402,guatemala401,mexico414,panama411,peru401,uruguay402,venezuela406,buenosaires409,mexico408" \
  --heal \
  --auto-continue

echo "[3/3] Deploying EU pool (4 boxes)..."
python3 "$SCRIPT_DIR/deploy_boxes_tui.py" \
  --non-interactive \
  --csv-path "$CSV_PATH" \
  --start-index 17 \
  --boxes 4 \
  --tunnels-per-box 15 \
  --first-base-port 8128 \
  --project-prefix pia15-eu \
  --proxy-prefix-template 'veu{n}' \
  --fixed-proxy-pass x0 \
  --mode server_names \
  --mode-value "madrid401,madrid403,madrid404,paris415,amsterdam447,zurich408,vienna403,brussels424,paris414,warsaw414,lisbon405,amsterdam428,zurich407,oslo407,vienna401" \
  --heal \
  --auto-continue

echo "Done: 10 US + 6 LATAM + 4 EU boxes deployed."
