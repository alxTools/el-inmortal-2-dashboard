# Mission Stack (End-to-End Orchestration)

This folder provides a Docker Compose driven stack to:

- Deploy regional proxy boxes (US/LATAM/EU)
- Run continuous healing (`check_proxy_pool.py --heal` loops)
- Keep a master controller online for multi-worker missions

It supports two modes:

- **Full**: 10 US + 6 LATAM + 4 EU (default 15 tunnels per box)
- **Test**: 3 total boxes (US/EU/LATAM), 1 tunnel per box

## Files

- `docker-compose.mission.yml`: full/test profiles and services
- `orchestrator.Dockerfile`: runtime image with docker + python tooling
- `deploy_full.sh`: full regional deployment sequence
- `deploy_test.sh`: 3-box smoke deployment sequence
- `healer_loop.sh`: continuous auto-healing loop
- `up_full.sh`, `up_test.sh`, `down.sh`: convenience scripts
- `AGENT.md`: mission operator guide
- `RULES.md`: operational guardrails

## Start Full Mission Stack

```bash
bash scripts/proxy/mission_stack/up_full.sh
```

## Start Test Mission Stack

```bash
bash scripts/proxy/mission_stack/up_test.sh
```

## Stop Stack

```bash
bash scripts/proxy/mission_stack/down.sh
```

## Logs

```bash
docker-compose -f scripts/proxy/mission_stack/docker-compose.mission.yml logs -f mission-healer-full
docker-compose -f scripts/proxy/mission_stack/docker-compose.mission.yml logs -f mission-healer-test
docker-compose -f scripts/proxy/mission_stack/docker-compose.mission.yml logs -f master-controller
```

## Worker Fleet + Master Controller

To deploy OpenCode workers on external VMs and connect from one master:

- Read: `scripts/proxy/opencode_cluster/README.md`
- Use rollout script: `scripts/proxy/opencode_cluster/rollout_workers_ssh.py`

Then replace `workers.example.json` with your real workers inventory.

## Notes

- `mission-deployer-*` services are one-shot; they prepare pools and exit.
- `mission-healer-*` stays running to maintain readiness.
- Keep credentials/inventories out of git.
