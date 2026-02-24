# Docker Setup - El Inmortal 2 Dashboard

## 🐳 Quick Start

### 1. Build y ejecutar
```bash
npm run docker:build
npm run docker:up
```

### 2. Ver logs
```bash
npm run docker:logs
```

### 3. Detener
```bash
npm run docker:down
```

## 📋 Scripts Disponibles

- `npm run docker:build` - Construir la imagen Docker
- `npm run docker:up` - Iniciar los contenedores
- `npm run docker:down` - Detener los contenedores
- `npm run docker:logs` - Ver logs en tiempo real
- `npm run docker:restart` - Reiniciar el contenedor web
- `npm run docker:shell` - Acceder al shell del contenedor

## 🔧 Configuración

### Variables de Entorno
Crea un archivo `.env` en la raíz:

```env
# Base de datos
DB_HOST=your-db-host
DB_PORT=3306
DB_USER=your-db-user
DB_PASSWORD=your-db-password
DB_NAME=your-db-name
DB_SSL=true

# Seguridad
SESSION_SECRET=your-secret-key
MCP_MASTER_API_KEY=your-master-key

# APIs
OPENAI_API_KEY=sk-...
DROPBOX_ACCESS_TOKEN=...
```

### Puertos
- **App**: 3100 (mapeado al host)
- **Container**: 3100

### Volúmenes
- `./public/uploads` → `/app/public/uploads`
- `./database` → `/app/database`

## 🏥 Health Check

El contenedor incluye un health check automático:
```
Endpoint: http://localhost:3100/api/health
```

Responde con:
```json
{
  "status": "ok",
  "service": "el-inmortal-2-dashboard",
  "version": "1.0.0",
  "timestamp": "2026-02-22T...",
  "uptime": 123.45
}
```

## 🔍 Troubleshooting

### Verificar estado
```bash
docker-compose ps
docker-compose exec web curl http://localhost:3100/api/health
```

### Rebuild completo
```bash
docker-compose down -v
docker-compose build --no-cache
docker-compose up -d
```

### Limpiar imágenes huérfanas
```bash
docker system prune -f
```

## 📦 Estructura

```
docker-compose.yml    # Configuración de servicios
Dockerfile           # Build de la imagen
.dockerignore        # Archivos ignorados en build
```
