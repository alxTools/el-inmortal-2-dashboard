#!/bin/bash
# Script para configurar deploy automático GitHub → Linode
# Ejecutar en tu servidor Linode como usuario gtalx

echo "🔧 Configuración de Deploy Automático"
echo "======================================"
echo ""

# 1. Verificar si ya existen claves SSH
echo "1. Verificando claves SSH existentes..."
if [ -f ~/.ssh/id_ed25519 ]; then
    echo "   ✅ Ya existe una clave SSH (id_ed25519)"
    echo ""
    echo "   📋 Clave PÚBLICA (agregar a GitHub):"
    cat ~/.ssh/id_ed25519.pub
    echo ""
    echo "   ⚠️  IMPORTANTE: Guarda la clave PRIVADA para GitHub:"
    echo "      Copia el contenido de: ~/.ssh/id_ed25519"
    echo "      (Es todo el archivo, incluyendo -----BEGIN OPENSSH PRIVATE KEY-----)"
else
    echo "   📝 Generando nueva clave SSH..."
    ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/id_ed25519 -N ""
    echo ""
    echo "   ✅ Clave generada!"
    echo ""
    echo "   📋 Clave PÚBLICA (agregar a GitHub):"
    cat ~/.ssh/id_ed25519.pub
    echo ""
    echo "   🔐 Clave PRIVADA (copiar a GitHub Secrets):"
    echo "      === COPIA TODO ESTO ==="
    cat ~/.ssh/id_ed25519
    echo "      === FIN ==="
fi

echo ""
echo "2. Configurando permisos..."
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys 2>/dev/null || touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519
cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "   ✅ Permisos configurados"

echo ""
echo "======================================"
echo "📋 INSTRUCCIONES PARA GITHUB:"
echo "======================================"
echo ""
echo "1. Ve a: https://github.com/alxTools/el-inmortal-2-dashboard/settings/secrets/actions"
echo ""
echo "2. Clic en 'New repository secret'"
echo ""
echo "3. Name: SSH_PRIVATE_KEY"
echo "   Value: Copia TODO el contenido de ~/.ssh/id_ed25519 (incluyendo las líneas de BEGIN/END)"
echo ""
echo "4. Clic en 'Add secret'"
echo ""
echo "5. Prueba haciendo un push:"
echo "   git commit --allow-empty -m 'test deploy' && git push"
echo ""
echo "======================================"
echo ""
echo "🧪 Para probar la conexión manualmente:"
echo "   Desde tu PC local con la clave privada:"
echo "   ssh -i ~/.ssh/id_ed25519 gtalx@172.233.181.181"
echo ""
