#!/bin/bash

# Script de actualización para el servidor de El Inmortal 2
# Uso:
#   ./update-server.sh
#   ./update-server.sh --push
#   ./update-server.sh --push -m "feat: mensaje de commit"

set -euo pipefail

PROJECT_DIR="/home/gtalx/el-inmortal-2-dashboard"
MODE="update"
COMMIT_MESSAGE=""

print_help() {
    cat <<'EOF'
Uso:
  ./update-server.sh
      Modo update (actual): stash + pull + build + restart

  ./update-server.sh --push
      Modo push: sube los cambios del servidor sin hacer pull

Opciones:
  --push           Activa modo push (no hace pull)
  -m, --message    Mensaje de commit para --push
  -h, --help       Muestra esta ayuda
EOF
}

while [[ $# -gt 0 ]]; do
    case "$1" in
        --push)
            MODE="push"
            shift
            ;;
        -m|--message)
            shift
            if [[ $# -eq 0 ]]; then
                echo "❌ Falta el mensaje para -m/--message"
                exit 1
            fi
            COMMIT_MESSAGE="$1"
            shift
            ;;
        -h|--help)
            print_help
            exit 0
            ;;
        *)
            echo "❌ Opción no reconocida: $1"
            print_help
            exit 1
            ;;
    esac
done

cd "$PROJECT_DIR" || exit 1

if [[ "$MODE" == "push" ]]; then
    echo "📤 Modo PUSH activado (sin pull)"

    CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    echo "🌿 Rama actual: $CURRENT_BRANCH"

    if [[ -z "$COMMIT_MESSAGE" ]]; then
        COMMIT_MESSAGE="chore: sync production changes from server $(date '+%Y-%m-%d %H:%M:%S')"
    fi

    if [[ -n "$(git status --porcelain)" ]]; then
        echo "📝 Agregando cambios..."
        git add -A

        echo "💾 Creando commit..."
        git commit -m "$COMMIT_MESSAGE"
    else
        echo "ℹ️ No hay cambios sin commit en working tree."
    fi

    if git rev-parse --abbrev-ref --symbolic-full-name "@{u}" >/dev/null 2>&1; then
        if [[ -n "$(git log --oneline "@{u}..HEAD")" ]]; then
            echo "⬆️  Haciendo push al remoto..."
            git push
            echo "✅ Push completado."
        else
            echo "ℹ️ No hay commits pendientes por subir."
        fi
    else
        echo "⚠️ Esta rama no tiene upstream configurado."
        echo "   Ejecuta manualmente: git push -u origin $CURRENT_BRANCH"
        exit 1
    fi

    exit 0
fi

echo "🔄 Actualizando El Inmortal 2 Dashboard..."
echo ""

echo "💾 Guardando cambios locales en stash..."
git stash

echo "⬇️  Descargando actualizaciones desde GitHub..."
git pull

echo "🔨 Compilando landing page..."
npm run landing:build

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
