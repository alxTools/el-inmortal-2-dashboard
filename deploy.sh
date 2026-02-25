#!/bin/bash
# Script de deploy para El Inmortal 2
# Uso: ./deploy.sh

set -e

echo "🚀 Iniciando deploy de El Inmortal 2..."
echo ""

# Colores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Git Pull
echo "📥 Descargando cambios..."
git pull origin main
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Git pull exitoso${NC}"
else
    echo -e "${RED}❌ Error en git pull${NC}"
    exit 1
fi
echo ""

# 2. Instalar dependencias nuevas
echo "📦 Instalando dependencias..."
npm install
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Dependencias instaladas${NC}"
else
    echo -e "${RED}❌ Error instalando dependencias${NC}"
    exit 1
fi
echo ""

# 3. Detener servidor anterior
echo "🛑 Deteniendo servidor anterior..."
if pgrep -f "node.*index.js" > /dev/null; then
    pkill -f "node.*index.js"
    echo -e "${GREEN}✅ Servidor anterior detenido${NC}"
    sleep 2
else
    echo -e "${YELLOW}⚠️  No se encontró proceso anterior${NC}"
fi
echo ""

# 4. Iniciar servidor
echo "▶️  Iniciando servidor..."
nohup npm start > server.log 2>&1 &
sleep 3

# Verificar si inició
if pgrep -f "node.*index.js" > /dev/null; then
    echo -e "${GREEN}✅ Servidor iniciado exitosamente${NC}"
    echo ""
    echo "📊 Estado:"
    echo "   PID: $(pgrep -f "node.*index.js")"
    echo "   Log: tail -f server.log"
    echo "   URL: http://localhost:3100 (o tu dominio)"
else
    echo -e "${RED}❌ Error iniciando servidor${NC}"
    echo "   Revisa el log: tail -20 server.log"
    exit 1
fi

echo ""
echo -e "${GREEN}🎉 Deploy completado!${NC}"
echo ""
echo "URLs disponibles:"
echo "   - Landing: /ei2"
echo "   - Checkout: /landing/checkout"
echo "   - Admin: /landing/admin/users"
echo "   - NFC: /unlock/:code"
echo ""
