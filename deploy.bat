#!/bin/bash
# Script de deploy para Windows (Git Bash / WSL)
# Uso: ./deploy.sh

echo "🚀 Iniciando deploy de El Inmortal 2..."
echo ""

# 1. Git Pull
echo "📥 Descargando cambios..."
git pull origin main
if errorlevel 1 (
    echo "❌ Error en git pull"
    exit /b 1
)
echo "✅ Git pull exitoso"
echo ""

# 2. Instalar dependencias nuevas
echo "📦 Instalando dependencias..."
call npm install
if errorlevel 1 (
    echo "❌ Error instalando dependencias"
    exit /b 1
)
echo "✅ Dependencias instaladas"
echo ""

# 3. Detener servidor anterior
echo "🛑 Deteniendo servidor anterior..."
taskkill /F /IM node.exe 2>nul
echo "✅ Servidor anterior detenido (si existía)"
timeout /t 2 > nul
echo ""

# 4. Iniciar servidor
echo "▶️  Iniciando servidor..."
start /B npm start > server.log 2>&1
timeout /t 3 > nul

# Verificar si inició
tasklist | findstr node.exe > nul
if errorlevel 1 (
    echo "❌ Error iniciando servidor"
    echo "Revisa el log: type server.log"
    exit /b 1
) else (
    echo "✅ Servidor iniciado exitosamente"
    echo ""
    echo "📊 Estado:"
    echo "   Log: tail -f server.log (o usa: type server.log)"
    echo "   URL: http://localhost:3100"
)

echo ""
echo "🎉 Deploy completado!"
echo ""
echo "URLs disponibles:"
echo "   - Landing: /ei2"
echo "   - Checkout: /landing/checkout"
echo "   - Admin: /landing/admin/users"
echo "   - NFC: /unlock/:code"
echo ""
pause
