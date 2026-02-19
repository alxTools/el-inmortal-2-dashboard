# El Inmortal 2 Dashboard

Dashboard operativo + API para gestionar lanzamientos de musica urbana (tracks, albums, splits, calendario, checklist, uploads y automatizaciones).

## Que incluye

- Panel web completo con login por sesion
- API programatica `v1` con API Keys por empresa (base para MCP)
- CRUD completo para entidades clave: albums, tracks, producers, composers, artists, splitsheets, calendar, checklist
- Endpoints de uploads y bulk upload disponibles tambien via API Key
- Transcripcion de letras con OpenAI Whisper y batch generation
- Tool YouTube Metadata Audit (inspeccion de canal + update masivo)
- Deploy via Docker / Docker Hub

## Stack

- Node.js + Express + EJS
- MySQL (fuente principal)
- Multer para uploads
- OpenAI API (transcripcion)
- Docker + Docker Compose

## Requisitos

- Node.js 20+
- MySQL accesible
- Docker Desktop (opcional, recomendado)

## Variables de entorno principales

Crea `.env` (puedes partir de `.env.example`):

```env
PORT=3000
NODE_ENV=development

DB_HOST=...
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
DB_BACKUP_DIR=...
DB_BACKUP_RETENTION_DAYS=14
DB_BACKUP_REQUESTED_BY=scheduler
MYSQLDUMP_PATH=C:/Program Files/MySQL/MySQL Workbench 8.0 CE/mysqldump.exe

YT_CLIENT_SECRETS_PATH=...
YT_TOKEN_FILE_PATH=...
PPLX_API_KEY=...
PPLX_MODEL=sonar-pro
SEO_PROMPT_TEMPLATE_PATH=...
YT_SEO_TOP_TRAFFIC_LIMIT=50
YT_DAILY_REPORT_TO=...
YT_REPORT_EMAIL_FROM=...
YT_REPORT_EMAIL_TRANSPORT=smtp # or graph

MS_GRAPH_TENANT_ID=...
MS_GRAPH_CLIENT_ID=...
MS_GRAPH_CLIENT_SECRET=...
MS_GRAPH_SENDER_USER=info@galantealx.com

SESSION_SECRET=...
SESSION_COOKIE_NAME=el2.sid
SESSION_MAX_AGE_DAYS=365
SESSION_ROLLING=true
SESSION_COOKIE_SECURE=true
SESSION_COOKIE_SAMESITE=lax
SESSION_CLEANUP_INTERVAL_MS=900000
WEBHOOK_SECRET=...
MCP_MASTER_API_KEY=...

OPENAI_API_KEY=...

SMTP_HOST=...
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=...
SMTP_PASS=...

APP_URL=https://dash.galanteelemperador.com
```

## Correr local (Node)

```bash
npm install
npm run dev
```

App: `http://localhost:3000`

## Correr local (Docker)

```bash
docker compose up -d --build
docker compose ps
```

App: `http://localhost:3000`

## Deploy desde Docker Hub

Image publicada:

- `alxtools/el-inmortal-2-dashboard:latest`

Server run:

```bash
docker pull alxtools/el-inmortal-2-dashboard:latest

docker stop el-inmortal-2-dashboard || true
docker rm el-inmortal-2-dashboard || true

docker run -d \
  --name el-inmortal-2-dashboard \
  --restart unless-stopped \
  -p 3000:3000 \
  --env-file /var/www/el-inmortal-2-dashboard/.env \
  -v /var/www/el-inmortal-2-dashboard/public/uploads:/app/public/uploads \
  alxtools/el-inmortal-2-dashboard:latest
```

## API v1 (MCP-ready)

Base URL: `/api/v1`

Auth:

- Header `x-api-key: <key>`
- o `Authorization: Bearer <key>`

Master key opcional (desde env): `MCP_MASTER_API_KEY`

### Crear API key

Con script local:

```bash
npm run api:key:create -- "MCP Galante" 1
```

Con endpoint (requiere master key):

`POST /api/v1/keys`

## Entidades con CRUD completo por API

- Albums: `/api/v1/albums`
- Tracks: `/api/v1/tracks`
- Producers: `/api/v1/producers`
- Composers: `/api/v1/composers`
- Artists: `/api/v1/artists`
- Splitsheets: `/api/v1/splitsheets`
- Calendar: `/api/v1/calendar`
- Checklist: `/api/v1/checklist`

Extras:

- Uploads protegidos por API key: `/api/v1/uploads/*`
- Bulk upload protegido por API key: `/api/v1/bulk-upload/*`
- Health: `GET /api/v1/health`
- Whoami: `GET /api/v1/me`
- Stats: `GET /api/v1/stats`

## Documentacion API completa

- Guía detallada: `docs/API.md`
- OpenAPI: `docs/openapi.yaml`

## Scripts utiles

```bash
npm start
npm run dev
npm run sync:images
npm run api:key:create -- "Key Name" 1
npm run youtube:audit -- inspect --by cli
npm run youtube:audit -- optimize-top --run-id 5 --limit 50 --by cli
npm run youtube:audit -- optimize-top-and-update --run-id 5 --limit 50 --by cli
npm run youtube:audit -- daily-report --by cli
npm run youtube:audit -- daily-report-email --to team@galanteelemperador.com --by cli
npm run youtube:audit -- quota-check --by cli
npm run youtube:audit -- quota-history --limit 72
npm run youtube:quota-monitor-tick -- --by cli --task-name ElInmortal2_YTQuotaMonitor
npm run db:backup
npm run db:setup:intel
npm run db:setup:track-rights
```

Para transporte `graph`, la App Registration debe tener permiso de aplicación `Mail.Send` con admin consent.

Para monitoreo horario de cuota YouTube en Windows:

```bat
install_youtube_quota_hourly_schedule.bat
check_youtube_quota_hourly_schedule.bat
uninstall_youtube_quota_hourly_schedule.bat
```

Para monitoreo intensivo (cada 5 minutos, hasta detectar reset y auto-detenerse):

```bat
install_youtube_quota_until_reset_schedule.bat
check_youtube_quota_until_reset_schedule.bat
uninstall_youtube_quota_until_reset_schedule.bat
```

Para backup horario de `db.artistaviral.com` en Windows:

```bat
install_db_backup_hourly_schedule.bat
check_db_backup_hourly_schedule.bat
uninstall_db_backup_hourly_schedule.bat
```

## Nota para expansion MCP multi-artista

La API `v1` ya soporta API keys y separacion por empresa en el modelo de keys. Para hard multitenancy total, el siguiente paso es agregar `company_id` en todas las tablas operativas y aplicar filtros por tenant en cada query.
