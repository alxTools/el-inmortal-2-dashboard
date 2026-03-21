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
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",
                "https://www.googletagmanager.com",
                "https://connect.facebook.net",
                "https://static.cloudflareinsights.com",
                "https://www.paypal.com",
                "https://www.sandbox.paypal.com",
                "https://www.paypalobjects.com",
                "https://*.paypal.com",
                "https://*.paypalobjects.com"
            ],
            scriptSrcAttr: ["'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            fontSrc: ["'self'", "data:", "https:"],
            connectSrc: [
                "'self'",
                "data:",
                "https:",
                "blob:",
                "https://www.googletagmanager.com",
                "https://www.paypal.com",
                "https://www.sandbox.paypal.com",
                "https://www.paypalobjects.com",
                "https://*.paypal.com",
                "https://*.paypalobjects.com"
            ],
            mediaSrc: ["'self'", "data:", "blob:"],
            frameSrc: [
                "'self'",
                "https://www.paypal.com",
                "https://www.sandbox.paypal.com",
                "https://www.paypalobjects.com",
                "https://*.paypal.com",
                "https://*.paypalobjects.com",
                "https://trykimu.com",
                "https://*.trykimu.com",
                "https://opal.google",
                "https://flow.google",
                "https://labs.google",
                "https://accounts.google.com"
            ],
        },
    },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginEmbedderPolicy: false,
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

const sessionMiddleware = session({
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
});

app.use(sessionMiddleware);

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Import role middleware
const { injectUser, requireAuth, requireAdmin, requireFanOrAdmin } = require('./middleware/roles');

function isAdminSessionUser(user) {
    const role = String(user?.role || '').trim().toLowerCase();
    return role === 'admin' || role === 'super_admin';
}

// Inject user info with roles into all views
app.use(injectUser);

// Make common data available to all views
app.use((req, res, next) => {
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
const landingApiRouter = require('./api/landing');
const apiV1Router = require('./routes/api-v1');
const fanGeneratorRouter = require('./routes/fan-generator');
const { apiKeyAuth } = require('./middleware/apiKeyAuth');

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

// Landing Page Public API (requires unlock cookie)
app.use('/api/landing', landingApiRouter);

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
app.get('/', (req, res, next) => {
    // Si es admin (tiene sesión), dejarlo pasar al dashboard
    if (req.session.user) {
        return next();
    }
    // Si no está autenticado, ir al landing
    res.redirect('/landing');
});

// Ruta /admin - shortcut para el dashboard
app.get('/admin', (req, res) => {
    if (isAdminSessionUser(req.session?.user)) {
        return res.redirect('/');
    }
    if (req.session?.user) {
        return res.redirect('/');
    }
    return res.redirect('/auth/login');
});

// Alias de acceso rapido para el tool de Mini-Disc
app.get('/minidisc-orders', (req, res) => {
    return res.redirect('/tools/minidisc-orders');
});

app.get('/minidisc-order', (req, res) => {
    return res.redirect('/tools/minidisc-orders');
});

app.get('/minidisc-generator', (req, res) => {
    return res.redirect('/tools/minidisc-generator');
});

app.get('/minidisc-gen', (req, res) => {
    return res.redirect('/tools/minidisc-generator');
});

app.get('/notes', (req, res) => {
    return res.redirect('/tools/notes');
});

app.get('/sticky-notes', (req, res) => {
    return res.redirect('/tools/notes');
});

app.get('/stream-control', (req, res) => {
    return res.redirect('/tools/stream-control');
});

app.get('/streams', (req, res) => {
    return res.redirect('/tools/stream-control');
});

app.get('/streamcontrol', (req, res) => {
    return res.redirect('/tools/stream-control');
});

app.get('/youtube-stream-control', (req, res) => {
    return res.redirect('/tools/stream-control');
});

app.get('/live-control', (req, res) => {
    return res.redirect('/tools/stream-control');
});

app.get('/story-gen', (req, res) => {
    return res.redirect('/tools/story-gen');
});

app.get('/flow', (req, res) => {
    return res.redirect('/tools/google-flow');
});

app.use('/api/auth', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorFrontendRootApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorFrontendRootApi(req, res);
});

app.use('/api/projects', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorFrontendRootApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorFrontendRootApi(req, res);
});

app.use('/api/assets', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorFrontendRootApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorFrontendRootApi(req, res);
});

app.use('/api/storage', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorFrontendRootApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorFrontendRootApi(req, res);
});

app.use('/render', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorRenderApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorRenderApi(req, res);
});

app.use('/ai/api', requireAdmin, (req, res, next) => {
    if (typeof toolsRouter.proxyVideoEditorFastApi !== 'function') {
        return next();
    }
    return toolsRouter.proxyVideoEditorFastApi(req, res);
});

// Protected routes with role-based access
// Admin-only routes
app.use('/tracks', requireAdmin, tracksRouter);
app.use('/producers', requireAdmin, producersRouter);
app.use('/composers', requireAdmin, composersRouter);
app.use('/artists', requireAdmin, artistsRouter);
app.use('/calendar', requireAdmin, calendarRouter);
app.use('/uploads', requireAdmin, uploadsRouter);
app.use('/bulk-upload', requireAdmin, bulkUploadRouter);
app.use('/settings', requireAdmin, settingsRouter);
app.use('/api', requireAdmin, apiRouter);

// Internal routes (admin only)
app.use('/splitsheets', requireAdmin, splitsheetsRouter);
app.use('/checklist', requireAdmin, checklistRouter);
app.use('/albums', requireAdmin, albumsRouter);
app.use('/', requireAuth, indexRouter);

// Fan Generator routes (session fan/admin)
app.use('/fan-generator', requireFanOrAdmin, fanGeneratorRouter);

// Tools routes - protect dangerous ones
const publicToolsPaths = ['/proxy', '/download', '/extract-frame', '/gpu-info'];
const fanToolsPaths = ['/minidisc-generator'];
app.use('/tools', (req, res, next) => {
    // Public paths don't need auth
    const isPublicPath = publicToolsPaths.some(path => req.path.startsWith(path));
    if (isPublicPath) {
        return next();
    }

    // Fan-allowed tool paths (require authenticated fan/admin session)
    const isFanToolPath = fanToolsPaths.some(path => req.path.startsWith(path));
    if (isFanToolPath) {
        return requireFanOrAdmin(req, res, next);
    }

    // All other tools need admin
    return requireAdmin(req, res, next);
}, toolsRouter);

// Multer error handling
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        const limitBytes = Number(err.limit);
        let limitLabel = 'el limite configurado';
        if (Number.isFinite(limitBytes) && limitBytes > 0) {
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            let size = limitBytes;
            let index = 0;
            while (size >= 1024 && index < units.length - 1) {
                size /= 1024;
                index += 1;
            }
            const precision = index <= 1 ? 0 : 2;
            limitLabel = `${size.toFixed(precision)} ${units[index]}`;
        }
        return res.status(400).json({ 
            error: `Archivo demasiado grande. Maximo ${limitLabel}.`
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

        const uploadRequestTimeoutMs = parseIntSafe(process.env.UPLOAD_REQUEST_TIMEOUT_MS, 2 * 60 * 60 * 1000);
        const keepAliveTimeoutMs = parseIntSafe(process.env.SERVER_KEEP_ALIVE_TIMEOUT_MS, 65 * 1000);

        server.requestTimeout = uploadRequestTimeoutMs;
        server.headersTimeout = Math.max(uploadRequestTimeoutMs + 60 * 1000, keepAliveTimeoutMs + 5 * 1000);
        server.keepAliveTimeout = keepAliveTimeoutMs;

        server.on('error', (err) => {
            console.error('Server error:', err);
        });

        server.on('upgrade', (req, socket, head) => {
            const isCodeEditorUpgrade = typeof toolsRouter.isCodeEditorUpgradeRequest === 'function'
                && toolsRouter.isCodeEditorUpgradeRequest(req);

            if (!isCodeEditorUpgrade) {
                socket.destroy();
                return;
            }

            const rejectUpgrade = (statusCode, reason) => {
                if (socket.destroyed) {
                    return;
                }

                const safeCode = Number(statusCode) || 500;
                const safeReason = String(reason || 'Upgrade Error').replace(/[\r\n]+/g, ' ').trim() || 'Upgrade Error';
                socket.write(`HTTP/1.1 ${safeCode} ${safeReason}\r\nConnection: close\r\n\r\n`);
                socket.destroy();
            };

            const upgradeResponseStub = {
                getHeader: () => undefined,
                setHeader: () => {},
                removeHeader: () => {},
                writeHead: () => {},
                end: () => {},
                on: () => {},
                once: () => {},
                emit: () => {},
                headersSent: false
            };

            try {
                sessionMiddleware(req, upgradeResponseStub, () => {
                    if (!isAdminSessionUser(req.session?.user)) {
                        return rejectUpgrade(401, 'Unauthorized');
                    }

                    if (typeof toolsRouter.handleCodeEditorUpgrade !== 'function') {
                        return rejectUpgrade(500, 'Code Editor upgrade handler missing');
                    }

                    try {
                        return toolsRouter.handleCodeEditorUpgrade(req, socket, head);
                    } catch (error) {
                        console.error('Code Editor upgrade handling error:', error);
                        return rejectUpgrade(502, `Bad Gateway (${error.message})`);
                    }
                });
            } catch (error) {
                console.error('Code Editor upgrade auth error:', error);
                return rejectUpgrade(500, `Session Error (${error.message})`);
            }
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
