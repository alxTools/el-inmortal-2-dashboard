# Deploy en Linode - El Inmortal 2 Dashboard

## 🚀 Instrucciones para Linode (Ubuntu 22.04 LTS)

### 1. Crear Servidor en Linode

1. Ve a https://cloud.linode.com
2. Crea un **Nanode 1GB** ($5/mes) o **Linode 2GB** ($10/mes) - ambos tienen suficiente RAM
3. Selecciona **Ubuntu 22.04 LTS**
4. En **SSH Keys**, agrega tu clave SSH pública
5. Crea el Linode

### 2. Conectar y Configurar

```bash
# Conectar vía SSH (reemplaza IP con tu IP de Linode)
ssh root@tu-ip-de-linode

# Actualizar sistema
apt-get update && apt-get upgrade -y

# Instalar Node.js 18.x
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Instalar PM2 y MySQL client
npm install -g pm2
apt-get install -y mysql-client git

# Crear directorio de la app
mkdir -p /var/www/el-inmortal-2-dashboard
cd /var/www/el-inmortal-2-dashboard
```

### 3. Subir Código

Opción A: Clonar desde GitHub
```bash
git clone https://github.com/alxTools/el-inmortal-2-dashboard.git .
```

Opción B: Subir vía SCP desde tu computadora
```bash
# En TU computadora (no en Linode):
scp -r C:\Users\AlexSerrano\Dropbox\skills_agent_rules\el-inmortal-2-webapp/* root@tu-ip:/var/www/el-inmortal-2-dashboard/
```

### 4. Instalar Dependencias

```bash
cd /var/www/el-inmortal-2-dashboard
npm install

# Crear directorio para logs
mkdir -p logs
```

### 5. Configurar Variables de Entorno

```bash
# Crear archivo .env
nano .env
```

Pega el contenido de `.env.example` y modifica según tus credenciales:

```env
# Database (ya está configurado para db.artistaviral.com)
DB_HOST=db.artistaviral.com
DB_USER=ailex
DB_PASSWORD=soyesmalandro.2
DB_NAME=artistaviral

# OpenAI (transcripción de letras)
OPENAI_API_KEY=sk-proj-...

# Dropbox (para archivos originales)
DROPBOX_ACCESS_TOKEN=sl.u....

# Google Drive (almacenamiento permanente)
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account",...}

# Otros
SESSION_SECRET=tu-secreto-aqui
ADMIN_USERNAME=admin
ADMIN_PASSWORD=tu-password-segura
NODE_ENV=production
PORT=3000
```

Guarda: `CTRL+O`, `ENTER`, `CTRL+X`

### 6. Iniciar la Aplicación con PM2

```bash
# Iniciar con PM2 usando el archivo de configuración
pm2 start ecosystem.config.js

# Guardar configuración para reinicio automático
pm2 save
pm2 startup systemd
```

### 7. Configurar Firewall (UFW)

```bash
# Instalar UFW si no está instalado
apt-get install -y ufw

# Permitir SSH, HTTP y HTTPS
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 3000/tcp

# Activar firewall
ufw enable
```

### 8. Configurar Nginx (Reverse Proxy + SSL)

```bash
# Instalar Nginx y Certbot
apt-get install -y nginx certbot python3-certbot-nginx

# Crear configuración de Nginx
nano /etc/nginx/sites-available/el-inmortal-2
```

Pega esto:

```nginx
server {
    listen 80;
    server_name dash.galanteelemperador.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    client_max_body_size 100M;
}
```

Activar:
```bash
ln -s /etc/nginx/sites-available/el-inmortal-2 /etc/nginx/sites-enabled/
rm /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
```

### 9. Configurar SSL (HTTPS)

```bash
# Obtener certificado SSL gratis de Let's Encrypt
certbot --nginx -d dash.galanteelemperador.com

# Seguir instrucciones (aceptar términos, elegir redirect)
```

### 10. Verificar que Todo Funciona

```bash
# Ver logs de la aplicación
pm2 logs

# Ver estado
pm2 status

# Probar URL
curl http://localhost:3000
```

### 11. Comandos Útiles

```bash
# Ver logs en tiempo real
pm2 logs

# Reiniciar aplicación
pm2 restart el-inmortal-2-dashboard

# Detener aplicación
pm2 stop el-inmortal-2-dashboard

# Ver uso de recursos
pm2 monit

# Actualizar después de cambios en código
git pull origin main
npm install
pm2 restart el-inmortal-2-dashboard
```

### 12. Backup Automático (Opcional)

```bash
# Crear script de backup
cat > /usr/local/bin/backup-dashboard.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/el-inmortal-2"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

# Backup de archivos subidos
tar -czf $BACKUP_DIR/uploads_$DATE.tar.gz /var/www/el-inmortal-2-dashboard/public/uploads

# Mantener solo últimos 7 días
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-dashboard.sh

# Agregar a crontab (corre cada día a las 2am)
echo "0 2 * * * /usr/local/bin/backup-dashboard.sh" | crontab -
```

## 🎉 ¡Listo!

Tu dashboard estará disponible en:
- **HTTP**: http://dash.galanteelemperador.com
- **HTTPS**: https://dash.galanteelemperador.com (después de certbot)

## 💡 Ventajas de Linode vs Render:

✅ **Sin límites de RAM** (1GB-2GB disponibles)
✅ **Archivos persistentes** (no se pierden entre reinicios)
✅ **Más barato** ($5-10/mes vs $20/mes en Render)
✅ **Control total** del servidor
✅ **SSL gratis** con Let's Encrypt
✅ **Subir archivos grandes** sin problemas de memoria

## 🆘 Solución de Problemas

### Si la app no inicia:
```bash
# Ver errores
pm2 logs

# Verificar que MySQL esté accesible
mysql -h db.artistaviral.com -u ailex -p

# Verificar variables de entorno
cat .env
```

### Si Nginx da error 502:
```bash
# Verificar que la app esté corriendo
pm2 status

# Verificar puerto
netstat -tlnp | grep 3000

# Reiniciar Nginx
systemctl restart nginx
```

### Si SSL no funciona:
```bash
# Verificar certificado
certbot certificates

# Renovar manualmente
certbot renew
```
