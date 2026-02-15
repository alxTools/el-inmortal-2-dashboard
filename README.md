# El Inmortal 2 - Launch Dashboard

Dashboard profesional para el lanzamiento del álbum "El Inmortal 2" de Galante el Emperador.

## 🚀 Características

- ✅ **Dashboard en tiempo real** con estadísticas actualizadas
- ⏰ **Timers de conteo regresivo** para cada día del lanzamiento
- 🎵 **Gestión de tracks** (21 temas)
- 🎧 **Gestión de productores** y splitsheets
- 📅 **Calendario de contenido** para 21 días
- ✅ **Checklist interactivo** de lanzamiento
- 📊 **API REST** completa
- 💾 **Base de datos SQLite** persistente
- 📱 **Diseño responsive**
- 🔒 **Sesiones seguras**

## 📋 Requisitos

- Node.js 16+ 
- npm o yarn

## 🛠️ Instalación

1. **Clonar o navegar al directorio:**
```bash
cd el-inmortal-2-webapp
```

2. **Instalar dependencias:**
```bash
npm install
```

3. **Configurar variables de entorno:**
```bash
cp .env.example .env
# Editar .env con tus configuraciones
```

4. **Inicializar la base de datos:**
```bash
npm run db:init
```

5. **Iniciar el servidor:**
```bash
# Modo desarrollo (con auto-reload)
npm run dev

# Modo producción
npm start
```

6. **Abrir en navegador:**
```
http://localhost:3000
```

## 📁 Estructura del Proyecto

```
el-inmortal-2-webapp/
├── src/
│   ├── app.js              # Servidor Express principal
│   ├── config/
│   │   └── database.js     # Configuración SQLite
│   ├── routes/
│   │   ├── index.js        # Rutas principales
│   │   ├── tracks.js       # API de tracks
│   │   ├── producers.js    # API de productores
│   │   ├── splitsheets.js  # API de splitsheets
│   │   ├── calendar.js     # API de calendario
│   │   ├── checklist.js    # API de checklist
│   │   └── api.js          # API REST
│   ├── models/             # Modelos de datos
│   ├── middleware/         # Middleware personalizado
│   └── utils/              # Utilidades
├── public/
│   ├── css/                # Estilos
│   ├── js/                 # JavaScript frontend
│   └── images/             # Imágenes
├── views/                  # Plantillas EJS
│   ├── partials/           # Parciales (navbar, footer)
│   └── *.ejs               # Vistas
├── database/               # Base de datos SQLite
├── package.json
└── .env.example
```

## 🌐 API Endpoints

### Dashboard
- `GET /` - Dashboard principal
- `GET /countdown` - Datos del conteo regresivo

### Tracks
- `GET /api/tracks` - Lista todos los tracks
- `POST /api/tracks` - Crea un nuevo track
- `PUT /api/tracks/:id` - Actualiza un track
- `DELETE /api/tracks/:id` - Elimina un track
- `POST /api/tracks/:id/status` - Actualiza estado

### Producers
- `GET /api/producers` - Lista todos los productores
- `POST /api/producers` - Crea un nuevo productor
- `PUT /api/producers/:id` - Actualiza un productor
- `DELETE /api/producers/:id` - Elimina un productor

### Stats
- `GET /api/stats` - Estadísticas del dashboard
- `GET /api/countdown` - Datos del conteo regresivo

### Checklist
- `GET /api/checklist` - Lista de tareas
- `POST /api/checklist/:id/toggle` - Marca/desmarca tarea

## 🎨 Personalización

### Cambiar fecha de lanzamiento
Editar en `src/app.js`:
```javascript
res.locals.launchDate = new Date('2026-02-17T00:00:00');
```

### Cambiar colores
Editar `public/css/dashboard.css`:
```css
:root {
  --primary-color: #ffd700;
  --secondary-color: #ff6b6b;
}
```

## 🚀 Deployment

### Railway / Render / Heroku
1. Conectar repositorio Git
2. Configurar variables de entorno
3. Deploy automático

### VPS propio
```bash
# Usar PM2 para producción
npm install -g pm2
pm2 start src/app.js --name "el-inmortal-2"
pm2 save
pm2 startup
```

## 📝 Scripts Disponibles

```bash
npm start          # Inicia el servidor
npm run dev        # Modo desarrollo con nodemon
npm test           # Ejecuta tests
npm run db:init    # Inicializa la base de datos
npm run db:seed    # Pobla con datos de ejemplo
```

## 🔒 Seguridad

- Helmet.js para headers de seguridad
- CORS configurado
- Sesiones en SQLite encriptadas
- Validación de inputs con express-validator
- SQL injection prevention con prepared statements

## 👨‍💻 Desarrollo

Para agregar nuevas funcionalidades:

1. Crear ruta en `src/routes/`
2. Crear vista en `views/`
3. Agregar estilos en `public/css/`
4. Actualizar navbar en `views/partials/navbar.ejs`

## 📞 Soporte

Para reportar issues o sugerencias:
- Email: [tu-email]
- GitHub Issues

## 📄 Licencia

MIT License - 2026 Galante el Emperador

---

**¡Listo para lanzar El Inmortal 2!** 🎤👑🚀