#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

docker-compose -f "$SCRIPT_DIR/docker-compose.mission.yml" up -d --build mission-deployer-full mission-healer-full master-controller

echo "Full mission stack started (deployer + healer + master-controller)."
