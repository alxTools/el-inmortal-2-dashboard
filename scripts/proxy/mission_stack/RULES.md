# Mission Rules

## Security

1. Never commit files containing API keys (`workers.json`, host inventories, `.env`).
2. Always enable OpenCode server auth (`OPENCODE_SERVER_PASSWORD`).
3. Keep worker endpoints private (VPN/private network/security group).

## Operations

1. Run `health` before mission launch.
2. Keep `healer` running for all active pools.
3. Use separate port ranges per region to avoid collisions.

## Prompt discipline

1. For web tasks, explicitly request Tavily-backed verification and sources.
2. For scraping tasks, request extraction format (JSON/table) and validation checks.
3. Use `chain` only when iterative refinement is needed.

## Reliability

1. Start with `test` profile before `full` rollout.
2. If a pool drops below target readiness, pause mission and heal first.
3. Keep mission prompts deterministic (clear scope, deliverable format, time window).
