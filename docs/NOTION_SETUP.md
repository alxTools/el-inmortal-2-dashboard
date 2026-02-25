# 📝 Guía Rápida: Configurar Notion Integration

## ⚡ Pasos para Activar (5 minutos)

### 1. Crear Integración en Notion

1. Ve a: https://www.notion.so/my-integrations
2. Clic en **"New integration"**
3. Nombre: `El Inmortal 2 - User Tracking`
4. Selecciona tu Workspace
5. Clic en **"Submit"**
6. Copia el **"Internal Integration Token"** (empieza con `secret_`)

### 2. Crear Base de Datos en Notion

1. En tu Notion, crea una nueva página
2. Escribe `/database` y selecciona **"Database - Full page"**
3. Título: `El Inmortal 2 - User Tracking`
4. Configura las propiedades (ver abajo)

### 3. Agregar Propiedades a la Base de Datos

Crea estas propiedades exactamente así:

| Propiedad | Tipo | Configuración |
|-----------|------|---------------|
| **Nombre** | Title | Por defecto |
| **ID** | Number | Número entero |
| **Email** | Email | - |
| **País** | Select | Opciones: México, España, Colombia, Argentina... |
| **Fecha Registro** | Date | Date only |
| **Paso Funnel** | Select | Ver opciones abajo ↓ |
| **Estado** | Select | Ver opciones abajo ↓ |
| **Email Mini-Disc** | Checkbox | - |
| **Fecha Email** | Date | Date only |
| **Interesado** | Checkbox | - |
| **PayPal Order ID** | Text | - |
| **Estado Pago** | Select | created, approved, captured, failed |
| **Código NFC** | Text | - |
| **Link NFC** | URL | - |
| **Enviado** | Checkbox | - |
| **Tracking** | Text | - |

**Opciones para "Paso Funnel":**
```
1 - Registrado (azul)
2 - Email Enviado (amarillo)
3 - Interesado (naranja)
4 - NFC Generado (púrpura)
5 - Checkout Iniciado (azul)
6 - Comprado (verde)
7 - Enviado (gris)
```

**Opciones para "Estado":**
```
Nuevo (azul)
Esperando (amarillo)
Hot Lead (naranja)
Preparando (púrpura)
En Proceso (azul)
Pago Confirmado (verde)
Completado (gris)
```

### 4. Obtener Database ID

1. Abre tu base de datos en Notion
2. Mira la URL del navegador:
   ```
   https://www.notion.so/workspace/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx?v=...
   ```
3. Copia la parte de 32 caracteres (entre la última `/` y el `?`)
4. Ese es tu **Database ID**

### 5. Compartir Base de Datos

1. En tu base de datos de Notion, clic en **"Share"** (arriba a la derecha)
2. Clic en **"Add people, emails, groups or integrations"**
3. Busca tu integración: `El Inmortal 2 - User Tracking`
4. Selecciónala y dale acceso **"Can edit"**
5. Clic en **"Invite"**

### 6. Configurar .env

Abre el archivo `.env` y completa:

```bash
# ============================================
# NOTION INTEGRATION - User Tracking
# ============================================

# Notion Integration Token (from https://www.notion.so/my-integrations)
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Notion Database ID (from the database URL)
NOTION_DATABASE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Enable automatic sync to Notion
NOTION_SYNC_ENABLED=true

# Sync on user registration (immediate)
NOTION_SYNC_ON_REGISTER=true

# Sync on purchase confirmation
NOTION_SYNC_ON_PURCHASE=true
```

### 7. Probar la Conexión

Reinicia el servidor y visita:
```
https://ei2.galantealx.com/landing/admin/notion/status
```

Deberías ver:
```json
{
  "success": true,
  "configured": true,
  "syncEnabled": true,
  "syncOnRegister": true,
  "syncOnPurchase": true,
  "stats": {
    "total": 0,
    "byStep": {}
  }
}
```

## 🔄 Sincronización Automática

Una vez configurado, los usuarios se sincronizarán automáticamente:

### Eventos que activan sync:

1. **Nuevo registro** → Paso 1 (Registrado)
2. **Email enviado (30 min)** → Paso 2 (Email Enviado)
3. **Checkout iniciado** → Paso 5 (Checkout)
4. **Pago confirmado** → Paso 6 (Comprado)

### Sincronización Manual

Si necesitas sincronizar manualmente:

```bash
# Sincronizar TODOS los usuarios
POST /landing/admin/notion/sync-all

# Sincronizar un usuario específico
POST /landing/admin/notion/sync-user
Body: { "userId": 123 }

# Ver estado de Notion
GET /landing/admin/notion/status
```

Desde el panel admin:
- Ve a `/landing/admin/users`
- Usa el botón "Sync to Notion"

## 🎨 Crear Dashboard en Notion

### Vista 1: Kanban (por paso del funnel)

1. En tu base de datos, clic en **"+ New"** (arriba a la izquierda)
2. Selecciona **"Board"**
3. Configura:
   - **Group by:** Paso Funnel
   - **Card preview:** Nombre, Email, País

### Vista 2: Timeline (fechas)

1. Clic en **"+ New"** → **"Timeline"**
2. Configura:
   - **Date property:** Fecha Registro
   - **Display:** Nombre

### Vista 3: Hot Leads

1. Clic en **"+ New"** → **"Table"**
2. Agrega filtro:
   - **Paso Funnel** → Contains → "Interesado"
3. Ordena por: Fecha Registro (descendente)

### Vista 4: Compras Confirmadas

1. Clic en **"+ New"** → **"Table"**
2. Agrega filtro:
   - **Paso Funnel** → Contains → "Comprado"
3. Muestra columnas: Nombre, Código NFC, Tracking

## 📊 Fórmulas Útiles

### Tasa de Conversión:
```
prop("Comprado") / prop("Total Registros") * 100
```

### Días desde registro:
```
dateBetween(now(), prop("Fecha Registro"), "days")
```

## 🔧 Troubleshooting

### Error: "Not configured"
- Verifica que `NOTION_TOKEN` y `NOTION_DATABASE_ID` estén en el .env
- Verifica que `NOTION_SYNC_ENABLED=true`
- Reinicia el servidor

### Error: "Database not found"
- Verifica que compartiste la base de datos con la integración
- Verifica que el Database ID es correcto (32 caracteres)

### Usuarios no aparecen en Notion
- Revisa los logs del servidor
- Verifica `/landing/admin/notion/status`
- Intenta sincronizar manualmente un usuario

### Sync muy lento
- Notion API tiene rate limit: 3 requests por segundo
- La sincronización masiva es lenta por diseño
- Para muchos usuarios, hazlo en batches pequeños

## 🔒 Seguridad

⚠️ **IMPORTANTE:**
- Nunca compartas tu `NOTION_TOKEN`
- No subas el .env a GitHub
- La base de datos de Notion contiene emails reales - mantenla privada
- Da acceso solo a personas de confianza

## 📱 URLs de Admin

- **Panel de usuarios:** `/landing/admin/users`
- **Estado Notion:** `/landing/admin/notion/status`
- **Export CSV:** `/landing/admin/export/csv`
- **Export JSON:** `/landing/admin/export/json`

## 🆘 Soporte

Si tienes problemas:
1. Revisa los logs del servidor
2. Verifica que las variables de entorno estén cargadas
3. Prueba el endpoint `/landing/debug`
4. Revisa la documentación oficial de Notion API: https://developers.notion.com

## ✅ Checklist de Verificación

- [ ] Integración creada en Notion
- [ ] Token copiado al .env
- [ ] Base de datos creada
- [ ] Propiedades configuradas correctamente
- [ ] Database ID copiado al .env
- [ ] Base de datos compartida con la integración
- [ ] NOTION_SYNC_ENABLED=true
- [ ] Servidor reiniciado
- [ ] Endpoint /status responde correctamente
- [ ] Primer usuario se sincronizó automáticamente

---

**¡Listo!** Ahora cada usuario que se registre aparecerá automáticamente en tu Notion. 🚀
