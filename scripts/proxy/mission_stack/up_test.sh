#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker-compose -f "$SCRIPT_DIR/docker-compose.mission.yml" up -d --build mission-deployer-test mission-healer-test master-controller

echo "Test mission stack started (3 boxes x 1 tunnel + healer + master-controller)."
