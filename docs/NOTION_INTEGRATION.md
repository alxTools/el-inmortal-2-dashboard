# 📊 Integración con Notion - Tracking de Usuarios

## 🎯 Estructura Recomendada en Notion

### 1. Crear Base de Datos

En Notion, crea una nueva base de datos con estas propiedades:

| Propiedad | Tipo | Opciones/Ejemplo |
|-----------|------|------------------|
| **ID** | Number | ID único del usuario |
| **Email** | Email | user@email.com |
| **Nombre** | Title | Juan Pérez |
| **País** | Select | México, España, Colombia... |
| **Fecha Registro** | Date | 2026-02-24 |
| **Paso Funnel** | Select | 1-Registrado, 2-Email Enviado, 3-Interesado, 4-NFC Generado, 5-Checkout, 6-Comprado, 7-Enviado |
| **Estado** | Select | Nuevo, Esperando, Hot Lead, Preparando, En Proceso, Pago Confirmado, Completado |
| **Email Mini-Disc** | Checkbox | ☑️ o ☐ |
| **Fecha Email** | Date | 2026-02-24 15:30 |
| **Interesado** | Checkbox | ☑️ o ☐ |
| **PayPal Order ID** | Text | 5O190127TN364715T |
| **Estado Pago** | Select | created, approved, captured, failed |
| **Código NFC** | Text | EI2X8K3M9P |
| **Link NFC** | URL | https://ei2.galantealx.com/unlock/EI2X8K3M9P |
| **Enviado** | Checkbox | ☑️ o ☐ |
| **Tracking** | Text | 1Z999AA10123456784 |
| **Source** | Select | landing_el_inmortal_2 |

### 2. Vistas Recomendadas

#### Vista 1: Kanban por Paso del Funnel
- **Agrupar por:** Paso Funnel
- **Mostrar:** Nombre, Email, País, Estado

#### Vista 2: Timeline
- **Mostrar:** Fecha Registro
- **Agrupar por:** Paso Funnel

#### Vista 3: Lista de Hot Leads
- **Filtro:** Interesado = ☑️ AND Estado Pago ≠ captured
- **Ordenar:** Fecha Registro (descendente)

#### Vista 4: Compras Confirmadas
- **Filtro:** Estado Pago = captured
- **Mostrar:** Nombre, Email, Código NFC, Tracking

### 3. Importar Datos

#### Opción A: Import CSV (Recomendado)
1. Exporta los datos: `node src/utils/exportUsers.js`
2. Abre el archivo CSV generado en `exports/`
3. En Notion: "Add a database" → "Import" → "CSV"
4. Selecciona el archivo
5. Mapea las columnas a las propiedades

#### Opción B: Notion API (Automatizado)
1. Crea una integración en https://www.notion.so/my-integrations
2. Copia el "Internal Integration Token"
3. Comparte tu base de datos con la integración
4. Copia el "Database ID" de la URL

### 4. Automatización con Make/Zapier

Puedes automatizar la sincronización:

**Trigger:** Webhook cuando un usuario se registra
**Action:** Crear página en Notion

Webhook URL: `https://ei2.galantealx.com/landing/webhook/notion`

### 5. Dashboard de Métricas

Crea una página con:

```
# 📈 Dashboard El Inmortal 2

## Métricas Clave
- Total Registros: {{database.total}}
- Tasa de Conversión: {{database.captured / database.total * 100}}%
- Hot Leads: {{database.interested}}
- Ventas Confirmadas: {{database.captured}}

## Gráficos
- Embudo de conversión
- Registros por día
- Top países
- Distribución por paso del funnel
```

## 🔄 Sincronización Automática

### Opción 1: Script Programado
```bash
# Agregar a crontab para exportar diariamente
0 9 * * * cd /path/to/project && node src/utils/exportUsers.js
```

### Opción 2: Webhook en Tiempo Real
Los eventos se envían a n8n (si está configurado en `.env`):
- `landing_subscription` - Nuevo registro
- `minidisc_interest` - Usuario marcó interés
- `paypal_order_created` - Orden creada
- `payment_captured` - Pago confirmado
- `nfc_code_generated` - Código NFC generado

## 📱 Funnel de Conversión

```
1. REGISTRADO (100%)
   ↓ 30 min después
2. EMAIL ENVIADO
   ↓ ~15% abren
3. INTERESADO (click en checkout)
   ↓ ~5% llegan al checkout
4. CHECKOUT INICIADO (PayPal)
   ↓ ~60% completan pago
5. PAGO CONFIRMADO
   ↓ Automático
6. NFC GENERADO
   ↓ Manual (cuando envías)
7. ENVIADO (con tracking)
```

## 🎨 Colores Sugeridos en Notion

- **Nuevo:** 🔵 Azul
- **Esperando:** 🟡 Amarillo
- **Hot Lead:** 🟠 Naranja
- **Preparando:** 🟣 Púrpura
- **En Proceso:** 🔵 Azul oscuro
- **Pago Confirmado:** 🟢 Verde
- **Completado:** ⚫ Gris

## 📋 Template de Notion

Puedes duplicar este template:
`https://notion.so/templates/el-inmortal-2-user-tracking`

## 🆘 Soporte

Si necesitas ayuda con la integración:
1. Revisa el archivo exportado en `exports/`
2. Verifica que los datos se vean correctos
3. Sigue la guía de importación de Notion
4. Configura las vistas según tus necesidades

## 🔐 Privacidad

⚠️ **Importante:** No compartas la base de datos de Notion públicamente ya que contiene emails reales de usuarios.

Configura los permisos adecuadamente:
- Solo tú: Full access
- Equipo: Comment only
- Público: No access
