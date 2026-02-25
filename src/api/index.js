const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
const helmet = require('helmet');
const cors = require('cors');
const methodOverride = require('method-override');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

function parseBool(value, fallback = false) {
    if (value === undefined || value === null || value === '') return fallback;
    const text = String(value).trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(text);
}

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "data:", "https:"],
        },
    },
}));

app.use(cors());

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Method override for PUT/DELETE from forms
app.use(methodOverride('_method'));

// Trust proxy (needed for Vercel)
app.set('trust proxy', 1);

// Session configuration (memory store for serverless)
const sessionMaxAgeMs = 365 * 24 * 60 * 60 * 1000;

app.use(session({
    name: process.env.SESSION_COOKIE_NAME || 'el2.sid',
    secret: process.env.SESSION_SECRET || 'el-inmortal-2-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    proxy: true,
    cookie: {
        secure: true,
        httpOnly: true,
        sameSite: 'lax',
        maxAge: sessionMaxAgeMs
    }
}));

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../../views'));

// Make session available to all views
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.albumName = 'El Inmortal 2';
    res.locals.artistName = 'Galante el Emperador';
    res.locals.launchDate = new Date('2026-02-17T00:00:00');
    next();
});

// Routes
const indexRouter = require('../routes/index');
const tracksRouter = require('../routes/tracks');
const albumsRouter = require('../routes/albums');
const producersRouter = require('../routes/producers');
const composersRouter = require('../routes/composers');
const artistsRouter = require('../routes/artists');
const splitsheetsRouter = require('../routes/splitsheets');
const calendarRouter = require('../routes/calendar');
const checklistRouter = require('../routes/checklist');
const apiRouter = require('../routes/api');
const authRouter = require('../routes/auth');
const uploadsRouter = require('../routes/uploads');
const bulkUploadRouter = require('../routes/bulk-upload');
const settingsRouter = require('../routes/settings');
const toolsRouter = require('../routes/tools');
const landingRouter = require('../routes/landing');
const apiV1Router = require('../routes/api-v1');
const { apiKeyAuth } = require('../middleware/apiKeyAuth');

// Authentication middleware
function requireAuth(req, res, next) {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    next();
}

// Middleware para verificar si es admin o fan verificado
function requireVerifiedFanOrAuth(req, res, next) {
    if (req.session.user) {
        return next();
    }
    
    const landingUnlock = req.cookies?.landing_el_inmortal_unlock;
    if (landingUnlock === '1') {
        return next();
    }
    
    return res.redirect('/ei2');
}

// Public routes
app.use('/auth', authRouter);
app.use('/landing', landingRouter);
app.use('/ei2', landingRouter);

app.use('/api/v1', apiV1Router);
app.use('/api/v1/uploads', apiKeyAuth, uploadsRouter);
app.use('/api/v1/bulk-upload', apiKeyAuth, bulkUploadRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'el-inmortal-2-dashboard',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
    });
});

// Protected routes
app.use('/', requireAuth, indexRouter);
app.use('/tracks', requireAuth, tracksRouter);

const publicToolsPaths = ['/proxy', '/download', '/extract-frame', '/gpu-info'];
app.use('/tools', (req, res, next) => {
    const isPublicPath = publicToolsPaths.some(path => req.path.startsWith(path));
    if (isPublicPath) {
        return next();
    }
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
    
    const isAPI = req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('multipart/form-data');
    
    if (isAPI) {
        res.status(err.status || 500).json({
            error: err.message || 'Algo salió mal!',
        });
    } else {
        res.status(err.status || 500).render('error', { 
            title: 'Error',
            message: err.message || 'Algo salió mal!',
            error: {}
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

module.exports = app;
