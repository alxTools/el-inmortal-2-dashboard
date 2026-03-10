# Mission Agent Guide

This mission stack is designed for one operator controlling many worker boxes.

## Roles

- `master-controller`: broadcasts and chains prompts to worker fleet.
- `workers`: execute OpenCode sessions with MCP tools and scraping runtime.
- `healer`: continuously checks/repairs proxy tunnels.

## Mission Modes

- **Broadcast**: same task to all workers in parallel.
- **Chain**: worker N output becomes worker N+1 input.

## Standard flow

1. Check worker health.
2. Launch mission prompt (`broadcast` or `chain`).
3. Validate output quality and sources.
4. Keep healer running during long missions.

## Example commands

```bash
python /app/master_controller.py health --workers /app/workers.json

python /app/master_controller.py broadcast \
  --workers /app/workers.json \
  --prompt "Use Tavily MCP to research topic X and provide structured sources."

python /app/master_controller.py chain \
  --workers /app/workers.json \
  --prompt "Start deep research on topic Y, each worker must improve the previous result."
```
