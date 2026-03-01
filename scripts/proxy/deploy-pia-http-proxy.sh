#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  deploy-pia-http-proxy.sh \
    --name pia-proxy-01 \
    --pia-user USERNAME \
    --pia-pass PASSWORD \
    --proxy-user PROXY_USER \
    --proxy-pass PROXY_PASSWORD \
    --port 3128 \
    [--region "US East"]

Notes:
  - Creates one Docker container using gluetun + PIA OpenVPN.
  - Exposes HTTP/HTTPS proxy on host port -> container 8888.
  - Proxy auth is required via --proxy-user / --proxy-pass.
EOF
}

NAME=""
PIA_USER=""
PIA_PASS=""
PROXY_USER=""
PROXY_PASS=""
PORT=""
REGION=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --pia-user) PIA_USER="$2"; shift 2 ;;
    --pia-pass) PIA_PASS="$2"; shift 2 ;;
    --proxy-user) PROXY_USER="$2"; shift 2 ;;
    --proxy-pass) PROXY_PASS="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --region) REGION="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage; exit 1 ;;
  esac
done

if [[ -z "$NAME" || -z "$PIA_USER" || -z "$PIA_PASS" || -z "$PROXY_USER" || -z "$PROXY_PASS" || -z "$PORT" ]]; then
  echo "Missing required argument(s)." >&2
  usage
  exit 1
fi

if ! [[ "$PORT" =~ ^[0-9]+$ ]]; then
  echo "--port must be numeric" >&2
  exit 1
fi

docker rm -f "$NAME" >/dev/null 2>&1 || true

docker_args=(
  run -d
  --name "$NAME"
  --restart unless-stopped
  --cap-add NET_ADMIN
  --device /dev/net/tun:/dev/net/tun
  -p "${PORT}:8888/tcp"
  -e VPN_SERVICE_PROVIDER=private\ internet\ access
  -e VPN_TYPE=openvpn
  -e OPENVPN_USER="$PIA_USER"
  -e OPENVPN_PASSWORD="$PIA_PASS"
  -e HTTPPROXY=on
  -e HTTPPROXY_USER="$PROXY_USER"
  -e HTTPPROXY_PASSWORD="$PROXY_PASS"
  -e HTTPPROXY_STEALTH=on
  -e TZ=America/Puerto_Rico
)

if [[ -n "$REGION" ]]; then
  docker_args+=( -e SERVER_REGIONS="$REGION" )
fi

docker_args+=( qmcgaw/gluetun )

docker "${docker_args[@]}" >/dev/null

echo "Started ${NAME} on port ${PORT}"
echo "Proxy URL: http://${PROXY_USER}:${PROXY_PASS}@$(curl -s ifconfig.me):${PORT}"
echo "Tip: check logs with: docker logs -f ${NAME}"
