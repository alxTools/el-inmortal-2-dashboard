# Proxy Fleet (PIA + Docker)

This folder contains tooling to deploy, monitor, and export authenticated HTTP proxies tunneled through Private Internet Access (PIA).

All scripts are compatible with Linux amd64 and ARM64 devices (Orange Pi / Raspberry Pi) as long as Docker is installed and `/dev/net/tun` is available.

## Quick Start (Single Pool)

```bash
python3 scripts/proxy/deploy_pia_stack.py \
  --pia-user "YOUR_PIA_USER" \
  --pia-pass "YOUR_PIA_PASS" \
  --count 15 \
  --base-port 3128 \
  --project pia15-box1 \
  --proxy-user-prefix vpx \
  --proxy-pass-fixed x0 \
  --region "US East"
```

## Diversified Servers (Per Container)

Use explicit PIA server names to spread tunnels across different cities:

```bash
python3 scripts/proxy/deploy_pia_stack.py \
  --pia-user "YOUR_PIA_USER" \
  --pia-pass "YOUR_PIA_PASS" \
  --count 15 \
  --base-port 3143 \
  --project pia15-box2-latam \
  --proxy-user-prefix vpl \
  --proxy-pass-fixed x0 \
  --server-names "buenosaires407,bolivia401,saopaolo401,chile401,colombia403,costarica401,ecuador401,guatemala401,mexico402,panama409,peru401,uruguay401,venezuela402,buenosaires408,mexico406"
```

## Health Check + FoxyProxy Export

```bash
python3 scripts/proxy/check_proxy_pool.py \
  --input scripts/proxy/generated/pia15-box2-latam/proxy-credentials.csv \
  --workers 8 \
  --timeout 12 \
  --heal
```

Outputs are written to the pool directory:

- `proxy-check-latest.json`
- `proxy-ready-latest.csv`
- `foxyproxy-ready-latest.json`

Import `foxyproxy-ready-latest.json` in Firefox FoxyProxy.

## Mission Control Dashboard

Open in browser:

- `/tools/proxy/mission-control`

It renders a live map/feed and uses status data from `proxy-check-latest.json` files.

## Raspberry Pi / Orange Pi Notes

1. Install Docker + docker-compose plugin.
2. Ensure WireGuard/OpenVPN prerequisites are present and `/dev/net/tun` exists.
3. Run scripts exactly as above.
4. Keep the checker running via cron for auto-healing.

Example cron (every 3 minutes):

```cron
*/3 * * * * /usr/bin/python3 /path/to/repo/scripts/proxy/check_proxy_pool.py --input /path/to/repo/scripts/proxy/generated/pia15-box1/proxy-credentials.csv --workers 8 --timeout 12 --heal >> /path/to/repo/scripts/proxy/generated/pia15-box1/checker-cron.log 2>&1
```
