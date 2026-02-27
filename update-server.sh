#!/bin/bash

# Script de actualización para el servidor de El Inmortal 2
# Guarda este archivo como: /home/gtalx/el-inmortal-2-dashboard/update-server.sh
# Para usarlo: cd /home/gtalx/el-inmortal-2-dashboard && chmod +x update-server.sh && ./update-server.sh

echo "🔄 Actualizando El Inmortal 2 Dashboard..."
echo ""

# Ir al directorio del proyecto
cd /home/gtalx/el-inmortal-2-dashboard || exit 1

# Guardar cambios locales (si los hay) en stash
echo "💾 Guardando cambios locales en stash..."
git stash

# Descargar últimos cambios
echo "⬇️  Descargando actualizaciones desde GitHub..."
git pull

# Compilar el landing page
echo "🔨 Compilando landing page..."
npm run landing:build

# Verificar si PM2 está instalado
if command -v pm2 &> /dev/null; then
    echo "🚀 Reiniciando con PM2..."
    pm2 restart el-inmortal-2 || pm2 start src/app.js --name el-inmortal-2
    echo "✅ ¡Servidor actualizado y corriendo con PM2!"
    echo ""
    pm2 status
else
    echo "🚀 Reiniciando proceso de Node.js..."
    pkill -f "node src/app.js"
    sleep 2
    nohup npm start > /dev/null 2>&1 &
    echo "✅ ¡Servidor actualizado y corriendo!"
    echo ""
    sleep 2
    ps aux | grep "node src/app.js" | grep -v grep
fi

echo ""
echo "🌐 El sitio debería estar disponible en: https://ei2.galantealx.com"
echo ""
echo "💡 Si hay problemas, revisa los logs con: pm2 logs el-inmortal-2"
echo "   o: tail -f /home/gtalx/el-inmortal-2-dashboard/nohup.out"