const express = require('express');
const path = require('path');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const helmet = require('helmet');
const cors = require('cors');
const methodOverride = require('method-override');
require('dotenv').config();

const app = express();
const PORT = 3020;

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

// Session configuration
app.use(session({
    store: new SQLiteStore({
        db: 'sessions.db',
        dir: path.join(__dirname, '../database')
    }),
    secret: process.env.SESSION_SECRET || 'el-inmortal-2-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
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
const producersRouter = require('./routes/producers');
const composersRouter = require('./routes/composers');
const artistsRouter = require('./routes/artists');
const splitsheetsRouter = require('./routes/splitsheets');
const calendarRouter = require('./routes/calendar');
const checklistRouter = require('./routes/checklist');
const apiRouter = require('./routes/api');
const authRouter = require('./routes/auth');
const uploadsRouter = require('./routes/uploads');

app.use('/', indexRouter);
app.use('/tracks', tracksRouter);
app.use('/producers', producersRouter);
app.use('/composers', composersRouter);
app.use('/artists', artistsRouter);
app.use('/splitsheets', splitsheetsRouter);
app.use('/calendar', calendarRouter);
app.use('/checklist', checklistRouter);
app.use('/api', apiRouter);
app.use('/auth', authRouter);
app.use('/uploads', uploadsRouter);

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

module.exports = app;