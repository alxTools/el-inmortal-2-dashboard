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

## Ops Runbook (Deploy + Recovery)

Use this when a pool goes down or after server reboot.

### Important safeguards

1. One box = one PIA account.
2. Keep pools on separate port ranges to avoid credential collisions.
   - `pia15-box1-us` (box1): `3128-3142`
   - `pia15-box2-latam` (box2): `3143-3157`
3. Mission Control reads `proxy-check-latest.json`; always run checker after deploy.
4. Cloudflare tunnel/webapp does not need to be restarted for proxy pool redeploys.

### Step 0: Validate current state

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
```

### Step 1: Re-deploy box1 (US diversified, 15 tunnels)

Pick 15 explicit US server names (one per tunnel), then deploy:

```bash
python3 scripts/proxy/deploy_pia_stack.py \
  --pia-user "YOUR_BOX1_PIA_USER" \
  --pia-pass "YOUR_BOX1_PIA_PASS" \
  --count 15 \
  --base-port 3128 \
  --project pia15-box1-us \
  --proxy-user-prefix vpx \
  --proxy-pass-fixed x0 \
  --server-names "alabama402,alaska402,littlerock402,atlanta411,baltimore401,losangeles404,chicago411,connecticut402,denver421,newjersey419,miami422,houston424,idaho402,iowa401,kansas402"
```

### Step 2: Re-deploy box2 (LATAM only, 15 tunnels, no US)

```bash
python3 scripts/proxy/deploy_pia_stack.py \
  --pia-user "YOUR_BOX2_PIA_USER" \
  --pia-pass "YOUR_BOX2_PIA_PASS" \
  --count 15 \
  --base-port 3143 \
  --project pia15-box2-latam \
  --proxy-user-prefix vpl \
  --proxy-pass-fixed x0 \
  --server-names "buenosaires410,bolivia401,saopaolo407,chile403,chile402,costarica403,ecuador402,guatemala401,mexico414,panama411,peru401,uruguay402,venezuela406,buenosaires409,mexico408"
```

### Step 3: Re-deploy box3 (Europe only, Madrid prioritized)

```bash
python3 scripts/proxy/deploy_pia_stack.py \
  --pia-user "YOUR_BOX3_PIA_USER" \
  --pia-pass "YOUR_BOX3_PIA_PASS" \
  --count 15 \
  --base-port 3158 \
  --project pia15-box3-eu \
  --proxy-user-prefix vpe \
  --proxy-pass-fixed x0 \
  --server-names "madrid401,madrid403,madrid404,paris415,amsterdam447,zurich408,vienna403,brussels424,paris414,warsaw414,lisbon405,amsterdam428,zurich407,oslo407,vienna401"
```

### Step 4: Health check + auto-heal (required)

```bash
python3 scripts/proxy/check_proxy_pool.py \
  --input scripts/proxy/generated/pia15-box1-us/proxy-credentials.csv \
  --workers 8 \
  --timeout 12 \
  --heal

python3 scripts/proxy/check_proxy_pool.py \
  --input scripts/proxy/generated/pia15-box2-latam/proxy-credentials.csv \
  --workers 8 \
  --timeout 12 \
  --heal

python3 scripts/proxy/check_proxy_pool.py \
  --input scripts/proxy/generated/pia15-box3-eu/proxy-credentials.csv \
  --workers 8 \
  --timeout 12 \
  --heal
```

### Step 5: Verify ready counts

Check these files:

- `scripts/proxy/generated/pia15-box1-us/proxy-check-latest.json`
- `scripts/proxy/generated/pia15-box2-latam/proxy-check-latest.json`
- `scripts/proxy/generated/pia15-box3-eu/proxy-check-latest.json`

Both should report `ready: 15` under normal conditions.

### Step 6: Keep pools healthy with cron

Every 3 minutes for box1 and box2:

```cron
*/3 * * * * /usr/bin/python3 /path/to/repo/scripts/proxy/check_proxy_pool.py --input /path/to/repo/scripts/proxy/generated/pia15-box1-us/proxy-credentials.csv --workers 8 --timeout 12 --heal >> /path/to/repo/scripts/proxy/generated/pia15-box1-us/checker-cron.log 2>&1
*/3 * * * * /usr/bin/python3 /path/to/repo/scripts/proxy/check_proxy_pool.py --input /path/to/repo/scripts/proxy/generated/pia15-box2-latam/proxy-credentials.csv --workers 8 --timeout 12 --heal >> /path/to/repo/scripts/proxy/generated/pia15-box2-latam/checker-cron.log 2>&1
*/3 * * * * /usr/bin/python3 /path/to/repo/scripts/proxy/check_proxy_pool.py --input /path/to/repo/scripts/proxy/generated/pia15-box3-eu/proxy-credentials.csv --workers 8 --timeout 12 --heal >> /path/to/repo/scripts/proxy/generated/pia15-box3-eu/checker-cron.log 2>&1
```
