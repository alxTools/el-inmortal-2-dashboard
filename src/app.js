const express = require('express');
const path = require('path');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const methodOverride = require('method-override');
require('dotenv').config();

const { initializeTables, seedInitialData } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 10000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Method override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// Static files
app.use(express.static(path.join(__dirname, '../public')));

// Trust proxy (needed for Nginx + Secure Cookies)
app.set('trust proxy', 1);

// Session configuration - using memory store for now (can be changed to MySQL later)
app.use(session({
    secret: process.env.SESSION_SECRET || 'el-inmortal-2-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production', // Requires HTTPS
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 24 // 24 hours
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

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Public routes (no auth required)
app.use('/auth', authRouter);

// Protected routes (auth required)
app.use('/', requireAuth, indexRouter);
app.use('/tracks', requireAuth, tracksRouter);
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

// Webhook for auto-deploy (no auth required)
const crypto = require('crypto');
const { exec } = require('child_process');

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

// Multer error handling
app.use((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ 
            error: 'Archivo demasiado grande. Máximo 100MB.' 
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
