const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const helmet = require('helmet');
const cors = require('cors');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');
const { exec } = require('child_process');
require('dotenv').config();

const { initializeTables, seedInitialData } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 10000;

function parseBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(text);
}

function parseIntSafe(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            fontSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors());

// Webhook for auto-deploy (must be before body parsing to get raw body)
app.post('/webhook/deploy', express.raw({ type: 'application/json' }), (req, res) => {
    const secret = process.env.WEBHOOK_SECRET || 'your-webhook-secret';
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        return res.status(401).json({ error: 'No signature' });
    }

    const hmac = crypto.createHmac('sha256', secret);
    const digest = 'sha256=' + hmac.update(req.body).digest('hex');

    if (signature !== digest) {
        return res.status(401).json({ error: 'Invalid signature' });
    }

    // Execute git pull and pm2 reload
    exec('cd /var/www/el-inmortal-2-dashboard && git pull && pm2 reload app', (error, stdout, stderr) => {
        if (error) {
            console.error('Deploy error:', error);
            return res.status(500).json({ error: 'Deploy failed', details: error.message });
        }
        console.log('Deploy output:', stdout);
        res.json({ success: true, message: 'Deployed successfully' });
    });
});

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Method override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// Local image fallback: if missing locally, use production URL
app.get('/uploads/images/:filename', (req, res, next) => {
    const localPath = path.join(__dirname, '../public/uploads/images', req.params.filename);
    if (fs.existsSync(localPath)) {
        return res.sendFile(localPath);
    }

    if (process.env.NODE_ENV !== 'production') {
        return res.redirect(`https://dash.galanteelemperador.com/uploads/images/${encodeURIComponent(req.params.filename)}`);
    }

    return next();
});

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Trust proxy (needed for Nginx + Secure Cookies)
app.set('trust proxy', 1);

// Session configuration (persistent MySQL store)
const sessionMaxAgeMs = parseIntSafe(
    process.env.SESSION_MAX_AGE_MS,
    parseIntSafe(process.env.SESSION_MAX_AGE_DAYS, 365) * 24 * 60 * 60 * 1000
);

const sessionStoreConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseIntSafe(process.env.DB_PORT, 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    clearExpired: true,
    checkExpirationInterval: parseIntSafe(process.env.SESSION_CLEANUP_INTERVAL_MS, 15 * 60 * 1000),
    expiration: sessionMaxAgeMs,
    createDatabaseTable: true,
    endConnectionOnClose: false
};

const sessionSslEnabled = parseBool(
    process.env.DB_SSL,
    !['localhost', '127.0.0.1'].includes(String(process.env.DB_HOST || 'localhost').toLowerCase())
);

if (sessionSslEnabled) {
    sessionStoreConfig.ssl = {
        rejectUnauthorized: parseBool(process.env.DB_SSL_REJECT_UNAUTHORIZED, false)
    };
}

let sessionStore;
try {
    sessionStore = new MySQLStore(sessionStoreConfig);
    sessionStore.on('error', (error) => {
        console.error('Session store error:', error.message);
    });
} catch (error) {
    console.error('Failed to initialize MySQL session store, falling back to memory store:', error.message);
}

app.use(session({
    name: process.env.SESSION_COOKIE_NAME || 'el2.sid',
    store: sessionStore,
    secret: process.env.SESSION_SECRET || 'el-inmortal-2-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    rolling: parseBool(process.env.SESSION_ROLLING, true),
    proxy: process.env.NODE_ENV === 'production',
    cookie: {
        secure: parseBool(process.env.SESSION_COOKIE_SECURE, process.env.NODE_ENV === 'production'),
        httpOnly: true,
        sameSite: process.env.SESSION_COOKIE_SAMESITE || 'lax',
        maxAge: sessionMaxAgeMs
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Make session available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.albumName = 'El Inmortal 2';
    res.locals.artistName = 'Galante el Emperador';
    res.locals.launchDate = new Date('2026-02-17T00:00:00');
    next();
});

// Routes
const indexRouter = require('./routes/index');
const tracksRouter = require('./routes/tracks');
const albumsRouter = require('./routes/albums');
const producersRouter = require('./routes/producers');
const composersRouter = require('./routes/composers');
const artistsRouter = require('./routes/artists');
const splitsheetsRouter = require('./routes/splitsheets');
const calendarRouter = require('./routes/calendar');
const checklistRouter = require('./routes/checklist');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const uploadsRouter = require('./routes/uploads');
const bulkUploadRouter = require('./routes/bulk-upload');
const settingsRouter = require('./routes/settings');
const toolsRouter = require('./routes/tools');
const landingRouter = require('./routes/landing');
const apiV1Router = require('./routes/api-v1');
const { apiKeyAuth } = require('./middleware/apiKeyAuth');

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Middleware para verificar si es admin o fan verificado (vía cookie de landing)
function requireVerifiedFanOrAuth(req, res, next) {
    // Si es admin (tiene sesión), permitir acceso
    if (req.session.user) {
        return next();
    }
    
    // Si no es admin, verificar si tiene cookie de landing verificada
    const landingUnlock = req.cookies?.landing_el_inmortal_unlock;
    if (landingUnlock === '1') {
        return next();
    }
    
    // Si no tiene ni sesión ni cookie, redirigir a landing para que se registre
    return res.redirect('/ei2');
}

// Public routes (no auth required)
app.use('/auth', authRouter);
app.use('/landing', landingRouter);

// Ruta corta /ei2 - URL principal para el álbum
app.use('/ei2', landingRouter);

app.use('/api/v1', apiV1Router);
app.use('/api/v1/uploads', apiKeyAuth, uploadsRouter);
app.use('/api/v1/bulk-upload', apiKeyAuth, bulkUploadRouter);

// Health check endpoint (public)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'el-inmortal-2-dashboard',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Redirigir raíz a landing solo si NO está autenticado
app.get('/', (req, res) => {
    // Si es admin (tiene sesión), dejarlo pasar al dashboard
    if (req.session.user) {
        return next();
    }
    // Si no está autenticado, ir al landing
    res.redirect('/landing');
});

// Protected routes (auth required)
app.use('/', requireAuth, indexRouter);
app.use('/tracks', requireAuth, tracksRouter);
// Tools routes with conditional auth - allow proxy, download, extract-frame, gpu-info without auth
const publicToolsPaths = ['/proxy', '/download', '/extract-frame', '/gpu-info'];
app.use('/tools', (req, res, next) => {
    console.log('Tools middleware - req.path:', req.path, 'req.originalUrl:', req.originalUrl);
    // Check if this is a public tools path
    const isPublicPath = publicToolsPaths.some(path => req.path.startsWith(path));
    console.log('Is public path:', isPublicPath);
    if (isPublicPath) {
        return next();
    }
    // Otherwise require auth
    return requireAuth(req, res, next);
}, toolsRouter);

app.use('/albums', requireAuth, albumsRouter);
app.use('/producers', requireAuth, producersRouter);
app.use('/composers', requireAuth, composersRouter);
app.use('/artists', requireAuth, artistsRouter);
app.use('/splitsheets', requireAuth, splitsheetsRouter);
app.use('/calendar', requireAuth, calendarRouter);
app.use('/checklist', requireAuth, checklistRouter);
app.use('/api', requireAuth, apiRouter);
app.use('/uploads', requireAuth, uploadsRouter);
app.use('/bulk-upload', requireAuth, bulkUploadRouter);
app.use('/settings', requireAuth, settingsRouter);

// Multer error handling
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
            error: 'Archivo demasiado grande. Máximo 150MB.' 
        });
    }
    if (err.message && err.message.includes('Solo se permiten archivos')) {
        return res.status(400).json({ 
            error: err.message 
        });
    }
    next(err);
});

// Error handling
app.use((err, req, res, next) => {
    console.error('ERROR:', err.stack);
    
    // Check if request expects JSON (AJAX/API call)
    const isAPI = req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('multipart/form-data');
    
    if (isAPI) {
        // Return JSON for API/AJAX requests
        res.status(err.status || 500).json({
            error: err.message || 'Algo salió mal!',
            details: process.env.NODE_ENV === 'development' ? err.stack : undefined
        });
    } else {
        // Return HTML for regular browser requests
        res.status(err.status || 500).render('error', { 
            title: 'Error',
            message: err.message || 'Algo salió mal!',
            error: process.env.NODE_ENV === 'development' ? err : {}
        });
    }
});

// 404 handler
app.use((req, res) => {
    const isAPI = req.xhr || req.headers.accept?.includes('application/json');
    
    if (isAPI) {
        res.status(404).json({ 
            error: 'Ruta no encontrada',
            path: req.path 
        });
    } else {
        res.status(404).render('error', {
            title: '404 - No Encontrado',
            message: 'La página que buscas no existe.',
            error: {}
        });
    }
});

// Initialize database and start server
async function startServer() {
    try {
        console.log('🔄 Checking database...');
        
        // NOTE: In production, we don't auto-initialize tables to preserve data
        // Tables should be created manually or via migration scripts
        // await initializeTables(); // DISABLED - prevents data loss on restart
        // await seedInitialData(); // DISABLED - prevents data overwrite
        
        console.log('✅ Database connection ready');
        
        // Start server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`
    🎵🎤👑 EL INMORTAL 2 LAUNCH DASHBOARD 👑🎤🎵
    
    Servidor corriendo en: http://localhost:${PORT}
    
    🚀 Dashboard: http://localhost:${PORT}
    📝 API Docs: http://localhost:${PORT}/api
    
    Presiona Ctrl+C para detener.
            `);
        });

        server.on('error', (err) => {
            console.error('Server error:', err);
        });
        
    } catch (err) {
        console.error('❌ Fatal error starting server:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
}

// Start the application
startServer();

module.exports = app;
