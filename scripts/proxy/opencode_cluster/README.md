# OpenCode Scraping Cluster (Controller + Workers)

This stack gives you a master controller that can fan out commands to many OpenCode workers.

Each worker is prepared for web scraping and Tavily MCP usage:

- OpenCode installed and running in `serve` mode
- Python scraping libraries (`requests`, `beautifulsoup4`, `lxml`, `playwright`)
- Chromium browser installed for dynamic scraping via Playwright
- Tavily MCP configured via OpenCode config

## Architecture

- `worker` container (one per VM/instance):
  - Runs `opencode serve` on port `4096`
  - Exposes HTTP API (`/global/health`, `/session/*`, `/mcp`, etc.)
  - Uses OpenCode config with Tavily remote MCP
- `controller` container (single):
  - Connects to all workers via HTTP API
  - Sends one command to all workers (broadcast)
  - Optional chained flow where output from worker N feeds worker N+1

## 1) Build images

```bash
docker build -t opencode-worker:latest -f scripts/proxy/opencode_cluster/worker.Dockerfile scripts/proxy/opencode_cluster
docker build -t opencode-controller:latest -f scripts/proxy/opencode_cluster/controller.Dockerfile scripts/proxy/opencode_cluster
```

## 2) Run worker on each VM

On each VM (repeat for all instances):

```bash
docker run -d --name opencode-worker \
  --restart unless-stopped \
  -p 4096:4096 \
  -e OPENCODE_SERVER_USERNAME=opencode \
  -e OPENCODE_SERVER_PASSWORD='CHANGE_ME' \
  -e TAVILY_API_KEY='tvly-...' \
  -e OPENCODE_MODEL='openai/gpt-5' \
  -v /opt/opencode-worker/state:/home/opencode/.local/share/opencode \
  -v /opt/opencode-worker/config:/home/opencode/.config/opencode \
  opencode-worker:latest
```

If your workers must use outbound proxies, pass `HTTP_PROXY` / `HTTPS_PROXY` env vars.

### 2b) Keep worker always on (systemd + compose)

If you want one local node (for example Puerto Rico) to stay online after reboots, use the included service installer:

```bash
cp scripts/proxy/opencode_cluster/.env.worker.example scripts/proxy/opencode_cluster/.env.worker
# edit credentials and model in .env.worker

bash scripts/proxy/opencode_cluster/install_worker_service.sh \
  scripts/proxy/opencode_cluster/.env.worker

curl -u opencode:YOUR_PASSWORD http://127.0.0.1:4096/global/health
```

Service management:

```bash
sudo systemctl status opencode-worker.service --no-pager
sudo systemctl restart opencode-worker.service
bash scripts/proxy/opencode_cluster/uninstall_worker_service.sh
```

## 3) Create workers inventory for master controller

Copy `scripts/proxy/opencode_cluster/workers.example.json` to `workers.json` and set real hosts/passwords.

## 4) Run master controller container

```bash
docker run --rm -it \
  -v "$PWD/scripts/proxy/opencode_cluster/workers.json:/app/workers.json:ro" \
  opencode-controller:latest \
  python /app/master_controller.py health --workers /app/workers.json
```

## 5) Optional: roll out workers to all VMs over SSH

1. Copy `hosts.example.json` to `hosts.json` and fill host info.
2. Run rollout script from the controller machine:

```bash
python3 scripts/proxy/opencode_cluster/rollout_workers_ssh.py \
  --hosts scripts/proxy/opencode_cluster/hosts.json \
  --ssh-key ~/.ssh/id_rsa \
  --image opencode-worker:latest
```

Broadcast a command to all workers:

```bash
docker run --rm -it \
  -v "$PWD/scripts/proxy/opencode_cluster/workers.json:/app/workers.json:ro" \
  opencode-controller:latest \
  python /app/master_controller.py broadcast \
    --workers /app/workers.json \
    --prompt "Use tavily tools to find the latest updates about X and summarize with sources."
```

Sequential chain flow (worker output feeds next worker):

```bash
docker run --rm -it \
  -v "$PWD/scripts/proxy/opencode_cluster/workers.json:/app/workers.json:ro" \
  opencode-controller:latest \
  python /app/master_controller.py chain \
    --workers /app/workers.json \
    --prompt "Research topic Y and improve results at each step."
```

## Notes

- OpenCode server auth is enforced with basic auth.
- Tavily MCP is injected dynamically by the controller on each worker before prompting.
- Keep `workers.json`, `hosts.json`, and `.env.worker` out of Git (they contain credentials).
