# Skill: Reusable Script Workflow

Este documento deja una regla global para cualquier script nuevo: debe ser reutilizable por proyecto sin reescribir logica.

## Regla global

Todo script nuevo debe cumplir este flujo:

1. `set -euo pipefail` al inicio.
2. Cargar config externa (`CONFIG_FILE`) antes de definir defaults.
3. Exponer variables clave por entorno (host, rutas, sesiones, llaves, puertos).
4. Incluir `usage()` con ejemplos reales.
5. Soportar subcomandos operativos minimos:
   - `status`
   - `stop`
   - comando principal (`start`/`now`/etc)
6. Validar dependencias (`command -v ...`) antes de ejecutar.
7. Dejar logs claros con timestamp.
8. Evitar valores hardcodeados que impidan reuso.

## Estandar de archivos

Para cada script nuevo:

- Script principal: `scripts/<nombre>.sh`
- Config ejemplo: `scripts/<nombre>.env.example`
- Config local real: `scripts/<nombre>.env` (no commitear secretos)

## Plantilla minima

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/<nombre>.env}"

if [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

VAR1="${VAR1:-default}"
VAR2="${VAR2:-default}"
```

## Checklist rapida antes de cerrar tarea

- `bash -n scripts/<nombre>.sh`
- Probar `status`
- Probar `stop`
- Probar flujo principal
- Confirmar que funciona con `.env` custom (`CONFIG_FILE=...`)

## Aplicado en este proyecto

- Script base ya alineado: `scripts/start-streams.sh`
- Config reusable de ejemplo: `scripts/start-streams.env.example`
- Skill operativa Cloudflare (DNS + redirect): `scripts/cloudflare-subdomain-redirect.sh`
- Config example Cloudflare: `scripts/cloudflare-subdomain-redirect.env.example`
- Config local Cloudflare: `scripts/cloudflare-subdomain-redirect.env` (no commitear secretos)
