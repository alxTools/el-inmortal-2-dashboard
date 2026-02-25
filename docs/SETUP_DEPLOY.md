# 🔧 Configurar Deploy Automático - Guía Visual

## ❌ Error Actual
El secret `SSH_PRIVATE_KEY` no existe en GitHub.

## ✅ Solución Paso a Paso

### **PASO 1: En tu servidor Linode** (como usuario gtalx)

Conéctate por SSH a tu servidor:
```bash
ssh gtalx@172.233.181.181
```

Ejecuta este comando:
```bash
cd /home/gtalx/el-inmortal-2-dashboard && bash scripts/setup-deploy.sh
```

**O manualmente:**
```bash
# Generar clave SSH
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/id_ed25519

# Ver la clave pública
cat ~/.ssh/id_ed25519.pub

# Ver la clave privada (GUÁRDALA PARA GITHUB)
cat ~/.ssh/id_ed25519
```

---

### **PASO 2: En GitHub** (en tu navegador)

1. **Ir a Settings:**
   ```
   https://github.com/alxTools/el-inmortal-2-dashboard/settings/secrets/actions
   ```

2. **Clic en botón verde:** `New repository secret`

3. **Llenar el formulario:**
   ```
   Name: SSH_PRIVATE_KEY
   Value: [Pega AQUÍ todo el contenido de ~/.ssh/id_ed25519 de tu servidor]
   ```

   **IMPORTANTE:** La clave privada debe incluir:
   ```
   -----BEGIN OPENSSH PRIVATE KEY-----
   b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
   ... (muchas líneas) ...
   -----END OPENSSH PRIVATE KEY-----
   ```

4. **Clic en:** `Add secret`

---

### **PASO 3: Verificar permisos en servidor**

En tu servidor Linode:
```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
chmod 600 ~/.ssh/id_ed25519
```

---

### **PASO 4: Probar deploy**

Haz un push vacío:
```bash
git commit --allow-empty -m "test deploy automático"
git push origin main
```

Ve a GitHub Actions y debería estar en verde ✅

---

## 🔍 Si sigue fallando

### Verificar logs:
En GitHub → Actions → Click en el workflow rojo → Ver los logs

### Probar conexión SSH manual:
Desde tu PC (con la clave privada descargada):
```bash
chmod 600 ~/Downloads/id_ed25519  # o donde guardaste la clave
ssh -i ~/Downloads/id_ed25519 gtalx@172.233.181.181
```

Si eso funciona, el deploy también funcionará.

---

## 📋 Checklist

- [ ] Clave SSH generada en servidor (`~/.ssh/id_ed25519`)
- [ ] Clave pública agregada a `~/.ssh/authorized_keys`
- [ ] Secret `SSH_PRIVATE_KEY` creado en GitHub
- [ ] Valor del secret es la CLAVE PRIVADA completa
- [ ] Permisos correctos en `~/.ssh/` (700, 600)
- [ ] Workflow usa usuario `gtalx` (no root)

---

## 🆘 Soporte

Si sigue sin funcionar, ejecuta en tu servidor:
```bash
# Verificar que el usuario puede hacer git pull
cd /home/gtalx/el-inmortal-2-dashboard
git pull origin main

# Verificar pm2
pm2 status

# Ver logs de errores
cat ~/.ssh/logs 2>/dev/null || echo "No hay logs de SSH"
```
