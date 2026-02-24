const express = require('express');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, query, run } = require('../config/database');
const { sendWelcomeEmail, sendWebhookToN8N } = require('../utils/emailHelper');
const { ensureLandingLeadsTable, syncToWordPress, getUnifiedStats } = require('../utils/landingDb');

const router = express.Router();

const FALLBACK_COVER = '/uploads/images/el_inmortal_2_cover_1771220102312.png';

const FALLBACK_TRACKS = [
    { trackNumber: 1, title: 'Si El Mundo Se Acabara', producer: 'Yow Fade & ALX', features: '', duration: '' },
    { trackNumber: 2, title: 'Toda Para Mi 2', producer: 'Askenax, Anthony The Producer & ALX', features: '', duration: '' },
    { trackNumber: 3, title: 'Dime Ahora Remix', producer: 'Askenax, Yow Fade & ALX', features: 'Genio & KillaTonez', duration: '' },
    { trackNumber: 4, title: 'Pa Buscarte', producer: 'Anthony The Producer & ALX', features: 'Tiana Estebanez', duration: '' },
    { trackNumber: 5, title: 'Come Calla', producer: 'Yow Fade, Bryan LMDE & ALX', features: '', duration: '' },
    { trackNumber: 6, title: 'Ya Te Mudastes', producer: 'Askenax & ALX', features: '', duration: '' },
    { trackNumber: 7, title: 'Si Te Vuelvo A Ver', producer: 'Wutti, Melody & ALX', features: 'Bayriton', duration: '' },
    { trackNumber: 8, title: 'Mi Tentasion', producer: 'Anthony The Producer & ALX', features: 'Dilox', duration: '' },
    { trackNumber: 9, title: 'Casi Algo', producer: 'Anthony The Producer & ALX', features: '', duration: '' },
    { trackNumber: 10, title: 'Cuenta Fantasma', producer: 'Music Zone & ALX', features: 'Dixon El Versatil', duration: '' },
    { trackNumber: 11, title: 'Inaceptable', producer: 'Anthony The Producer & ALX', features: '', duration: '' },
    { trackNumber: 12, title: 'No Se Que Somos', producer: 'Wutti & ALX', features: '', duration: '' },
    { trackNumber: 13, title: 'No Te Enamores', producer: 'Askenax, Wutti & ALX', features: 'La DeLaJota', duration: '' },
    { trackNumber: 14, title: 'Siguele', producer: 'Anthony The Producer & ALX', features: '', duration: '' },
    { trackNumber: 15, title: 'No Me Quieres Entender', producer: 'DMT Level & ALX', features: 'Lenny Low', duration: '' },
    { trackNumber: 16, title: 'Sigo En La Mia', producer: 'Wutti & ALX', features: 'Dizak', duration: '' },
    { trackNumber: 17, title: 'En La Nave', producer: 'Wutti & ALX', features: 'Sota', duration: '' },
    { trackNumber: 18, title: 'Tu Pirata', producer: 'UBeats & ALX', features: 'Pablo Nick', duration: '' },
    { trackNumber: 19, title: 'Al Que Se Meta Remix', producer: 'Yeizel & ALX', features: 'Joe Yncio', duration: '' },
    { trackNumber: 20, title: 'Pa Chingal', producer: 'Wutti & ALX', features: '', duration: '' },
    { trackNumber: 21, title: 'Las Eleven', producer: 'Wutti & ALX', features: '', duration: '' }
];

function splitNames(raw) {
    return String(raw || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
}

function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function toPublicImagePath(rawPath) {
    const source = String(rawPath || '').trim();
    if (!source) return FALLBACK_COVER;

    if (/^https?:\/\//i.test(source)) return source;

    const normalized = source.replace(/\\/g, '/');
    const publicIdx = normalized.toLowerCase().lastIndexOf('/public/');
    if (publicIdx >= 0) {
        return normalized.slice(publicIdx + '/public'.length);
    }

    const uploadsIdx = normalized.toLowerCase().indexOf('/uploads/');
    if (uploadsIdx >= 0) {
        return normalized.slice(uploadsIdx);
    }

    if (normalized.startsWith('/')) return normalized;

    return `/uploads/images/${path.basename(normalized)}`;
}

function toPublicMediaPath(rawPath) {
    const source = String(rawPath || '').trim();
    if (!source) return '';

    if (/^https?:\/\//i.test(source)) return source;

    const normalized = source.replace(/\\/g, '/');
    const uploadsIdx = normalized.toLowerCase().indexOf('/uploads/');
    if (uploadsIdx >= 0) {
        return normalized.slice(uploadsIdx);
    }

    if (normalized.startsWith('/uploads/')) return normalized;
    if (normalized.startsWith('uploads/')) return `/${normalized}`;

    return '';
}

// Función reutilizable para renderizar la landing
async function renderLandingPage(res) {
    let album = null;
    let tracks = [];

    try {
        album = await getOne(
            `SELECT id, name, artist, release_date, description, cover_image_path
             FROM album_info
             ORDER BY id ASC
             LIMIT 1`
        );

        tracks = await getAll(
            `SELECT
                t.id,
                t.track_number,
                t.title,
                t.features,
                t.duration,
                t.audio_file_path,
                p.name AS producer_name
             FROM tracks t
             LEFT JOIN producers p ON p.id = t.producer_id
             ORDER BY t.track_number ASC
             LIMIT 22`
        );
    } catch (error) {
        console.error('Landing page DB warning:', error.message);
    }

    const trackMap = new Map();
    for (const track of tracks || []) {
        const key = normalizeTitle(track.title);
        if (key && !trackMap.has(key)) {
            trackMap.set(key, track);
        }
    }

    const normalizedTracks = FALLBACK_TRACKS.map((fallback, idx) => {
        const key = normalizeTitle(fallback.title);
        const dbTrack = trackMap.get(key);
        const trackNum = Number(fallback.trackNumber || idx + 1);
        return {
            id: dbTrack?.id || `track_${trackNum}`,
            trackNumber: trackNum,
            title: fallback.title,
            producer: fallback.producer,
            features: fallback.features,
            duration: String(dbTrack?.duration || fallback.duration || '').trim(),
            audioUrl: toPublicMediaPath(dbTrack?.audio_file_path)
        };
    });

    const collaborators = new Set();
    for (const track of normalizedTracks) {
        splitNames(track.features).forEach((name) => collaborators.add(name));
        splitNames(track.producer).forEach((name) => collaborators.add(name));
    }

    const featuredTracks = normalizedTracks.filter((track) => track.features).length;

    const landingData = {
        albumName: String(album?.name || 'El Inmortal 2').trim(),
        artistName: String(album?.artist || 'Galante el Emperador').trim(),
        releaseDate: album?.release_date
            ? new Date(album.release_date).toISOString()
            : '2026-02-17T00:00:00.000Z',
        description:
            String(album?.description || '').trim() ||
            'Una nueva etapa musical con 21 canciones para dominar playlist editoriales, radio y contenido corto en todas las plataformas.',
        coverImage: toPublicImagePath(album?.cover_image_path),
        tracks: normalizedTracks,
        stats: {
            totalTracks: normalizedTracks.length || 21,
            collaborators: collaborators.size,
            featuredTracks
        },
        streamingLinks: {
            spotify: String(process.env.LANDING_SPOTIFY_URL || '').trim(),
            appleMusic: String(process.env.LANDING_APPLE_MUSIC_URL || '').trim(),
            youtubeMusic: String(process.env.LANDING_YOUTUBE_MUSIC_URL || '').trim(),
            deezer: String(process.env.LANDING_DEEZER_URL || '').trim()
        }
    };

    const publicRoot = path.join(__dirname, '../../public');
    const assetsReady =
        fs.existsSync(path.join(publicRoot, 'css', 'album-landing.tailwind.css')) &&
        fs.existsSync(path.join(publicRoot, 'js', 'album-landing.bundle.js'));

    return res.render('landing/el-inmortal-2', {
        title: `${landingData.albumName} | Landing`,
        landingData,
        landingDataJson: JSON.stringify(landingData).replace(/</g, '\\u003c'),
        assetsReady
    });
}

// Ruta principal - renderiza la landing page
router.get('/', async (_req, res) => {
    return renderLandingPage(res);
});

router.post('/subscribe', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const fullName = String(req.body.full_name || req.body.name || '').trim();
    const country = String(req.body.country || '').trim();
    const sourceLabel = String(req.body.source || 'landing_el_inmortal_2').trim() || 'landing_el_inmortal_2';
    const wantsJson =
        req.is('application/json') ||
        String(req.headers.accept || '').includes('application/json');

    console.log('[Landing Subscribe] Received request:', { email, fullName, country, sourceLabel });

    if (!fullName || !country) {
        console.log('[Landing Subscribe] Missing fields:', { fullName, country });
        if (!wantsJson) {
            return res.redirect('/ei2?unlock=0');
        }
        return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        console.log('[Landing Subscribe] Invalid email:', email);
        if (!wantsJson) {
            return res.redirect('/ei2?unlock=0');
        }
        return res.status(400).json({ success: false, error: 'email_invalid' });
    }

    try {
        console.log('[Landing Subscribe] ========== INICIANDO REGISTRO ==========');
        console.log('[Landing Subscribe] Datos recibidos:', { email, fullName, country, sourceLabel });
        console.log('[Landing Subscribe] IP:', req.ip);
        
        // Intentar guardar en DB, pero si falla, continuamos igual
        let result = { lastID: null };
        try {
            console.log('[Landing Subscribe] Paso 1: Verificando tabla...');
            await ensureLandingLeadsTable();
            console.log('[Landing Subscribe] ✅ Tabla verificada');
            
            console.log('[Landing Subscribe] Paso 2: Insertando datos...');
            result = await run(
                `INSERT INTO landing_email_leads (email, full_name, country, source_label, ip_address, user_agent)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    email,
                    fullName,
                    country,
                    sourceLabel,
                    req.ip,
                    String(req.headers['user-agent'] || '').slice(0, 255)
                ]
            );
            console.log('[Landing Subscribe] ✅ Datos insertados, ID:', result.lastID);
        } catch (dbError) {
            console.error('[Landing Subscribe] ⚠️ Error en DB (continuando igual):', dbError.message);
            // No fallamos, continuamos para enviar email y webhook
        }
        console.log('[Landing Subscribe] Table ready, inserting data...');

        // Sincronizar con tablas WordPress existentes (no bloqueante)
        console.log('[Landing Subscribe] Paso 3: Sincronizando con WordPress...');
        let syncResults = [];
        try {
            syncResults = await syncToWordPress({ email, full_name: fullName, country, source_label: sourceLabel });
            console.log('[Landing Subscribe] ✅ Sincronización WordPress:', syncResults);
        } catch (syncError) {
            console.log('[Landing Subscribe] ⚠️ Error sincronizando WordPress (continuando):', syncError.message);
        }

        // Enviar email de bienvenida y webhook en paralelo (no bloqueantes)
        console.log('[Landing Subscribe] Paso 4: Enviando email y webhook...');
        
        const [emailResult, webhookResult] = await Promise.allSettled([
            sendWelcomeEmail({ to: email, name: fullName, country: country }),
            sendWebhookToN8N({
                email,
                fullName,
                country,
                sourceLabel,
                ipAddress: req.ip,
                userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
                registeredAt: new Date().toISOString(),
                wordpressSync: syncResults
            })
        ]);

        console.log('[Landing Subscribe] Email result:', emailResult.status === 'fulfilled' ? emailResult.value : emailResult.reason);
        console.log('[Landing Subscribe] Webhook result:', webhookResult.status === 'fulfilled' ? webhookResult.value : webhookResult.reason);

        // Establecer cookie de acceso para fans verificados (válida por 7 días)
        res.cookie('landing_el_inmortal_unlock', '1', {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días (1 semana)
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });

        if (!wantsJson) {
            return res.redirect('/ei2?unlock=1');
        }

        return res.json({ 
            success: true, 
            id: result.lastID, 
            emailSent: emailResult.status === 'fulfilled' ? emailResult.value?.success : false, 
            webhookSent: webhookResult.status === 'fulfilled' ? webhookResult.value?.success : false,
            wordpressSync: syncResults
        });
    } catch (error) {
        console.error('[Landing Subscribe] ❌ ERROR CRÍTICO:', error);
        console.error('[Landing Subscribe] Tipo de error:', error.constructor.name);
        console.error('[Landing Subscribe] Mensaje:', error.message);
        console.error('[Landing Subscribe] Stack trace:', error.stack);
        
        if (!wantsJson) {
            return res.redirect('/ei2?unlock=0&error=' + encodeURIComponent(error.message));
        }
        return res.status(500).json({ 
            success: false, 
            error: 'server_error', 
            details: error.message,
            type: error.constructor.name 
        });
    }
});

// Variable para mantener el número más alto mostrado (nunca baja)
let highestDisplayedCount = 15000; // Número base inicial

router.get('/stats', async (_req, res) => {
    try {
        // Obtener estadísticas unificadas de todas las fuentes
        const stats = await getUnifiedStats();
        
        // NÚMERO REAL (para logs internos)
        const realTotal = stats.total || 0;
        
        // Calcular número inflado basado en real
        const baseInflated = Math.floor(realTotal * 18); // Multiplicador fijo de 18x
        
        // Agregar incremento aleatorio pequeño (0-50) para simular actividad
        const randomIncrement = Math.floor(Math.random() * 50);
        const newTotal = baseInflated + randomIncrement;
        
        // Solo actualizar si es mayor (nunca baja)
        if (newTotal > highestDisplayedCount) {
            highestDisplayedCount = newTotal;
        }
        
        // Log para que veas el número real
        console.log(`[Landing Stats] Real: ${realTotal} | Mostrado: ${highestDisplayedCount}`);
        
        return res.json({
            totalLeads: highestDisplayedCount,
            localLeads: stats.local,
            wordpressSites: stats.wordpress,
            topCountries: stats.topCountries || []
        });
    } catch (error) {
        console.error('Landing stats error:', error);
        // Fallback - devolver el número más alto conocido
        return res.json({
            totalLeads: highestDisplayedCount,
            localLeads: 0,
            wordpressSites: [],
            topCountries: []
        });
    }
});

// GET track info público (solo para fans verificados o admins)
router.get('/track/:id', async (req, res) => {
    // Verificar si es admin o fan verificado
    const isAdmin = req.session.user ? true : false;
    const isVerifiedFan = req.cookies?.landing_el_inmortal_unlock === '1';
    
    if (!isAdmin && !isVerifiedFan) {
        return res.redirect('/ei2');
    }
    
    try {
        const trackId = req.params.id;
        
        const track = await getOne(
            `SELECT t.*, p.name as producer_name 
             FROM tracks t 
             LEFT JOIN producers p ON t.producer_id = p.id 
             WHERE t.id = ?`, 
            [trackId]
        );
        
        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }
        
        // Si es admin, redirigir a la vista admin completa
        if (isAdmin) {
            return res.redirect(`/tracks/${trackId}`);
        }
        
        // Fan verificado: mostrar vista solo lectura
        res.render('landing/track-info', {
            title: track.title,
            track: track,
            isFan: true,
            isAdmin: false
        });
    } catch (error) {
        console.error('[Landing Track Info] Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando tema',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Endpoint de diagnóstico temporal
router.get('/debug', async (req, res) => {
    try {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            node_version: process.version,
            env_vars: {
                DB_HOST: process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado',
                DB_NAME: process.env.DB_NAME ? '✅ Configurado' : '❌ No configurado',
                MS_GRAPH_TENANT_ID: process.env.MS_GRAPH_TENANT_ID ? '✅ Configurado' : '⚠️ No configurado (email opcional)',
                N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL ? '✅ Configurado' : '⚠️ No configurado (webhook opcional)'
            }
        };
        
        // Probar conexión a DB
        try {
            await ensureLandingLeadsTable();
            diagnostics.database = '✅ Conexión exitosa';
        } catch (dbError) {
            diagnostics.database = `❌ Error: ${dbError.message}`;
        }
        
        // Probar email helper
        try {
            const emailHelper = require('../utils/emailHelper');
            diagnostics.email_helper = '✅ Cargado correctamente';
        } catch (helperError) {
            diagnostics.email_helper = `❌ Error: ${helperError.message}`;
        }
        
        res.json(diagnostics);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

module.exports = router;
