const express = require('express');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, query, run } = require('../config/database');
const { sendWelcomeEmail, sendMiniDiscConfirmationEmail, sendWebhookToN8N } = require('../utils/emailHelper');
const { ensureLandingLeadsTable, saveNFCCode, syncToWordPress, getUnifiedStats, registerOrUpdateLead, verifyMagicToken, markEmailAsVerified } = require('../utils/landingDb');
const { createPayPalOrder, capturePayPalOrder, getPayPalConfig } = require('../utils/paypalHelper');
const { scheduleMiniDiscEmail } = require('../utils/scheduledEmails');
const { syncUserToNotion, isNotionConfigured, syncAllUsersToNotion, getNotionStats } = require('../utils/notionHelper');

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

// Cache para archivos de audio disponibles
let audioFilesCache = null;
let audioFilesCacheTime = 0;
const CACHE_DURATION = 60000; // 1 minuto

function getAvailableAudioFiles() {
    const now = Date.now();
    if (audioFilesCache && (now - audioFilesCacheTime) < CACHE_DURATION) {
        return audioFilesCache;
    }
    
    try {
        const audioDir = path.join(__dirname, '../../public/uploads/audio');
        if (fs.existsSync(audioDir)) {
            audioFilesCache = fs.readdirSync(audioDir)
                .filter(f => f.toLowerCase().endsWith('.wav') || f.toLowerCase().endsWith('.mp3'))
                .map(f => ({
                    filename: f,
                    path: `/uploads/audio/${f}`,
                    // Extraer número de track del nombre (ej: "177188..._01_..." -> "01")
                    trackNum: f.match(/_(\d+)_/)?.[1] || null,
                    // Extraer nombre limpio para matching
                    cleanName: f.toLowerCase()
                        .replace(/^\d+_/, '')
                        .replace(/\.wav$|\.mp3$/i, '')
                        .replace(/[^a-z0-9]/g, '')
                }));
            audioFilesCacheTime = now;
            return audioFilesCache;
        }
    } catch (err) {
        console.error('Error reading audio directory:', err.message);
    }
    return [];
}

function findAudioFileByTrackNumber(trackNumber) {
    const files = getAvailableAudioFiles();
    const targetNum = String(trackNumber).padStart(2, '0');
    
    // Buscar por número de track en el nombre del archivo
    const match = files.find(f => f.trackNum === targetNum);
    if (match) {
        console.log(`[Audio] Found match for track ${trackNumber}: ${match.filename}`);
        return match.path;
    }
    
    return null;
}

function toPublicMediaPath(rawPath, trackNumber = null) {
    const source = String(rawPath || '').trim();
    
    // Si no hay path pero hay número de track, buscar en uploads/audio
    if (!source && trackNumber) {
        const found = findAudioFileByTrackNumber(trackNumber);
        if (found) return found;
    }
    
    if (!source) return '';

    if (/^https?:\/\//i.test(source)) return source;

    const normalized = source.replace(/\\/g, '/');
    
    // Si es ruta local de uploads, usarla
    const uploadsIdx = normalized.toLowerCase().indexOf('/uploads/');
    if (uploadsIdx >= 0) {
        return normalized.slice(uploadsIdx);
    }

    if (normalized.startsWith('/uploads/')) return normalized;
    if (normalized.startsWith('uploads/')) return `/${normalized}`;

    // Si es ruta de Dropbox/local pero tenemos el track number, buscar archivo
    if (trackNumber) {
        const found = findAudioFileByTrackNumber(trackNumber);
        if (found) return found;
    }

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
            id: dbTrack?.id || String(trackNum),
            trackNumber: trackNum,
            title: fallback.title,
            producer: fallback.producer,
            features: fallback.features,
            duration: String(dbTrack?.duration || fallback.duration || '').trim(),
            audioUrl: toPublicMediaPath(dbTrack?.audio_file_path, trackNum)
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
            youtube: 'https://www.youtube.com/@galanteelemperador'
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
        
        // PASO 1: Verificar tabla y registrar lead con magic token
        let userResult;
        try {
            console.log('[Landing Subscribe] Paso 1: Verificando tabla...');
            await ensureLandingLeadsTable();
            console.log('[Landing Subscribe] ✅ Tabla verificada');
            
            console.log('[Landing Subscribe] Paso 2: Registrando/actualizando lead con magic token...');
            userResult = await registerOrUpdateLead({
                email,
                fullName,
                country,
                ipAddress: req.ip,
                userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
                sourceLabel
            });
            console.log('[Landing Subscribe] ✅ Lead registrado:', userResult);
        } catch (dbError) {
            console.error('[Landing Subscribe] ❌ Error en DB:', dbError.message);
            if (!wantsJson) {
                return res.redirect('/ei2?error=db_error');
            }
            return res.status(500).json({ success: false, error: 'db_error' });
        }

        // Sincronizar con tablas WordPress existentes (no bloqueante)
        console.log('[Landing Subscribe] Paso 3: Sincronizando con WordPress...');
        let syncResults = [];
        try {
            syncResults = await syncToWordPress({ email, full_name: fullName, country, source_label: sourceLabel });
            console.log('[Landing Subscribe] ✅ Sincronización WordPress:', syncResults);
        } catch (syncError) {
            console.log('[Landing Subscribe] ⚠️ Error sincronizando WordPress (continuando):', syncError.message);
        }

        // Enviar email con MAGIC LINK y webhook en paralelo
        console.log('[Landing Subscribe] Paso 4: Enviando email con magic link...');
        
        const [emailResult, webhookResult] = await Promise.allSettled([
            sendWelcomeEmail({ 
                to: email, 
                name: fullName, 
                country: country,
                magicToken: userResult.magicToken,
                userId: userResult.userId
            }),
            sendWebhookToN8N({
                email,
                fullName,
                country,
                sourceLabel,
                ipAddress: req.ip,
                userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
                registeredAt: new Date().toISOString(),
                wordpressSync: syncResults,
                isNewUser: userResult.isNew,
                userId: userResult.userId
            })
        ]);

        console.log('[Landing Subscribe] Email result:', emailResult.status === 'fulfilled' ? emailResult.value : emailResult.reason);
        console.log('[Landing Subscribe] Webhook result:', webhookResult.status === 'fulfilled' ? webhookResult.value : webhookResult.reason);

        // Programar email de Mini-Disc para 30 minutos después (solo si es usuario nuevo)
        if (userResult.isNew && userResult.userId) {
            console.log('[Landing Subscribe] Paso 5: Programando email de Mini-Disc para 30 min después...');
            try {
                await scheduleMiniDiscEmail(userResult.userId, email, {
                    fullName,
                    country,
                    sourceLabel
                });
                console.log('[Landing Subscribe] ✅ Email de Mini-Disc programado');
            } catch (scheduleError) {
                console.error('[Landing Subscribe] ⚠️ Error programando email Mini-Disc:', scheduleError.message);
                // No fallamos si esto falla
            }
        }

        // Sincronizar con Notion (en tiempo real)
        if (process.env.NOTION_SYNC_ENABLED === 'true' && process.env.NOTION_SYNC_ON_REGISTER === 'true' && userResult.userId) {
            console.log('[Landing Subscribe] Paso 6: Sincronizando con Notion...');
            try {
                const userData = {
                    id: userResult.userId,
                    email,
                    full_name: fullName,
                    country,
                    created_at: new Date().toISOString(),
                    minidisc_email_sent: 0,
                    interested_in_minidisc: 0,
                    paypal_order_id: null,
                    paypal_payment_status: null,
                    nfc_unique_code: null,
                    package_shipped: 0,
                    tracking_number: null,
                    magic_token: userResult.magicToken,
                    email_verified: 0
                };
                const notionResult = await syncUserToNotion(userData);
                console.log('[Landing Subscribe] ✅ Notion sync:', notionResult.success ? 'OK' : 'Skipped');
            } catch (notionError) {
                console.error('[Landing Subscribe] ⚠️ Error sincronizando con Notion:', notionError.message);
                // No fallamos si esto falla
            }
        }

        // IMPORTANTE: NO establecer cookie todavía
        // El usuario debe confirmar su email primero mediante el magic link
        
        if (!wantsJson) {
            // Redirigir a página de "Revisa tu email"
            return res.redirect('/ei2?check_email=1');
        }

        return res.json({ 
            success: true, 
            id: userResult.userId, 
            emailSent: emailResult.status === 'fulfilled' ? emailResult.value?.success : false, 
            webhookSent: webhookResult.status === 'fulfilled' ? webhookResult.value?.success : false,
            wordpressSync: syncResults,
            message: 'Revisa tu email para verificar y desbloquear el acceso'
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

// Ruta para verificar magic token y desbloquear acceso
router.get('/unlock', async (req, res) => {
    const { token } = req.query;
    
    if (!token) {
        return res.status(400).render('error', {
            title: 'Link Inválido',
            message: 'El link de verificación no es válido o ha expirado.'
        });
    }
    
    try {
        // Verificar el token
        const user = await verifyMagicToken(token);
        
        if (!user) {
            return res.status(400).render('error', {
                title: 'Link Expirado',
                message: 'Este link ha expirado o no es válido. Por favor regístrate de nuevo.'
            });
        }
        
        // Marcar email como verificado
        await markEmailAsVerified(user.id);
        
        // Crear o actualizar usuario fan en la tabla users
        const [existingUser] = await query('SELECT id FROM users WHERE email = ?', [user.email]);
        let userId;
        
        if (existingUser) {
            // Actualizar usuario existente a fan
            await run('UPDATE users SET role = ?, name = ? WHERE id = ?', 
                ['fan', user.full_name || user.email.split('@')[0], existingUser.id]);
            userId = existingUser.id;
        } else {
            // Crear nuevo usuario fan
            const result = await run(
                'INSERT INTO users (email, name, role, created_at) VALUES (?, ?, ?, NOW())',
                [user.email, user.full_name || user.email.split('@')[0], 'fan']
            );
            userId = result.lastID;
        }
        
        // Crear sesión de fan
        req.session.user = {
            id: userId,
            email: user.email,
            name: user.full_name || user.email.split('@')[0],
            role: 'fan'
        };
        
        // AHORA sí crear la cookie de desbloqueo
        res.cookie('landing_el_inmortal_unlock', '1', {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax'
        });
        
        console.log(`[Landing Unlock] ✅ Usuario ${user.email} verificado y desbloqueado como FAN (ID: ${userId})`);
        
        // Redirigir al álbum (fan home)
        res.redirect('/albums/1?verified=1');
        
    } catch (error) {
        console.error('[Landing Unlock] Error:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Ocurrió un error al procesar tu solicitud. Por favor intenta de nuevo.'
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

// GET Top 10 tracks más escuchados
router.get('/top-tracks', async (req, res) => {
    try {
        const topTracks = await getAll(`
            SELECT 
                t.id,
                t.title,
                t.track_number,
                COUNT(tp.id) as play_count
            FROM tracks t
            LEFT JOIN track_plays tp ON t.id = tp.track_id
            WHERE t.is_public = 1
            GROUP BY t.id, t.title, t.track_number
            ORDER BY play_count DESC
            LIMIT 10
        `);
        
        return res.json({
            success: true,
            tracks: topTracks
        });
    } catch (error) {
        console.error('[Top Tracks] Error:', error);
        return res.json({
            success: false,
            tracks: []
        });
    }
});

// Sample comments to rotate when there aren't enough real comments
const SAMPLE_COMMENTS = [
    { id: 'sample_1', user_name: 'Ana R.', comment: '🔥 El Inmortal 2 está ROMPIENDO! Cada track es mejor que el anterior', created_at: new Date().toISOString() },
    { id: 'sample_2', user_name: 'Diego M.', comment: 'Llevo esperando esto meses! Valió totalmente la pena ⭐⭐⭐⭐⭐', created_at: new Date().toISOString() },
    { id: 'sample_3', user_name: 'Sofia L.', comment: 'La producción de Yow Fade en el track 1 es increíble 🎧', created_at: new Date().toISOString() },
    { id: 'sample_4', user_name: 'Carlos G.', comment: 'Ya tengo mi Mini-Disc reservado! Vamos por esa edición limitada 💿', created_at: new Date().toISOString() },
    { id: 'sample_5', user_name: 'Mariana P.', comment: 'Las colaboraciones en este álbum son de otro nivel 🙌', created_at: new Date().toISOString() },
    { id: 'sample_6', user_name: 'Juan D.', comment: 'Desde el track 3 estoy en bucle... esto es arte puro', created_at: new Date().toISOString() },
    { id: 'sample_7', user_name: 'Lucia H.', comment: 'Galante nunca decepciona. Leyenda del género 👑', created_at: new Date().toISOString() },
    { id: 'sample_8', user_name: 'Pedro S.', comment: 'Acabo de escuchar el track 7 con Bayriton... TEMAZO! 🔥', created_at: new Date().toISOString() },
    { id: 'sample_9', user_name: 'Valentina R.', comment: '¿Alguien más no puede parar de escuchar Las Eleven? 🎵', created_at: new Date().toISOString() },
    { id: 'sample_10', user_name: 'Miguel A.', comment: 'Esto va directo a mis playlists favoritas. Álbum del año seguro 🏆', created_at: new Date().toISOString() }
];

// GET comments (público, solo aprobados)
router.get('/comments', async (req, res) => {
    try {
        const comments = await getAll(`
            SELECT id, user_name, comment, created_at, user_id
            FROM landing_comments
            WHERE is_approved = 1
            ORDER BY created_at DESC
            LIMIT 5
        `);
        
        // If less than 5 comments, fill with sample comments
        let finalComments = comments;
        if (comments.length < 5) {
            const needed = 5 - comments.length;
            // Shuffle sample comments and pick needed amount
            const shuffled = [...SAMPLE_COMMENTS].sort(() => 0.5 - Math.random());
            finalComments = [...comments, ...shuffled.slice(0, needed)];
        }
        
        return res.json({
            success: true,
            comments: finalComments
        });
    } catch (error) {
        console.error('[Comments] Error fetching:', error);
        // Return sample comments on error
        return res.json({
            success: true,
            comments: SAMPLE_COMMENTS.slice(0, 5)
        });
    }
});

// POST new comment (requiere estar verificado)
router.post('/comments', async (req, res) => {
    try {
        const { comment } = req.body;
        
        // Verificar que está verificado (tiene sesión o cookie)
        const isVerified = req.session?.user || req.cookies?.landing_el_inmortal_unlock === '1';
        
        if (!isVerified) {
            return res.status(401).json({
                success: false,
                error: 'Debes verificar tu email para comentar'
            });
        }
        
        if (!comment || comment.trim().length < 3) {
            return res.status(400).json({
                success: false,
                error: 'El comentario debe tener al menos 3 caracteres'
            });
        }
        
        if (comment.trim().length > 500) {
            return res.status(400).json({
                success: false,
                error: 'El comentario no puede exceder 500 caracteres'
            });
        }
        
        // Obtener nombre del usuario
        let userName = 'Fan';
        let userEmail = '';
        let userId = null;
        let leadId = null;
        
        if (req.session?.user) {
            userName = req.session.user.name || req.session.user.email.split('@')[0];
            userEmail = req.session.user.email;
            userId = req.session.user.id;
        } else {
            // Intentar obtener de la lead por cookie
            const leadEmail = req.cookies?.landing_email;
            if (leadEmail) {
                const lead = await getOne('SELECT id, email, full_name FROM landing_email_leads WHERE email = ?', [leadEmail]);
                if (lead) {
                    userName = lead.full_name || lead.email.split('@')[0];
                    userEmail = lead.email;
                    leadId = lead.id;
                }
            }
        }
        
        // Rate limiting: Check if user has commented in last 30 seconds
        if (userId || leadId) {
            const recentComment = await getOne(`
                SELECT id FROM landing_comments 
                WHERE (user_id = ? OR lead_id = ?) 
                AND created_at > DATE_SUB(NOW(), INTERVAL 30 SECOND)
                LIMIT 1
            `, [userId, leadId]);
            
            if (recentComment) {
                return res.status(429).json({
                    success: false,
                    error: 'Espera 30 segundos antes de comentar de nuevo'
                });
            }
        }
        
        // Guardar comentario
        const result = await run(
            `INSERT INTO landing_comments (lead_id, user_id, user_name, user_email, comment, is_approved)
             VALUES (?, ?, ?, ?, ?, 1)`,
            [leadId, userId, userName, userEmail, comment.trim()]
        );
        
        return res.json({
            success: true,
            message: 'Comentario publicado',
            comment: {
                id: result.lastID || result.insertId,
                user_name: userName,
                comment: comment.trim(),
                created_at: new Date().toISOString(),
                user_id: userId,
                lead_id: leadId
            }
        });
    } catch (error) {
        console.error('[Comments] Error saving:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al guardar el comentario'
        });
    }
});

// DELETE comment (solo el autor puede borrar)
router.delete('/comments/:id', async (req, res) => {
    try {
        const commentId = req.params.id;
        
        // Verificar que está autenticado
        const isVerified = req.session?.user || req.cookies?.landing_el_inmortal_unlock === '1';
        
        if (!isVerified) {
            return res.status(401).json({
                success: false,
                error: 'No autorizado'
            });
        }
        
        // Obtener user info
        let userId = null;
        let leadId = null;
        
        if (req.session?.user) {
            userId = req.session.user.id;
        } else {
            const leadEmail = req.cookies?.landing_email;
            if (leadEmail) {
                const lead = await getOne('SELECT id FROM landing_email_leads WHERE email = ?', [leadEmail]);
                if (lead) leadId = lead.id;
            }
        }
        
        // Verificar que el comentario pertenece al usuario
        const comment = await getOne(
            'SELECT id FROM landing_comments WHERE id = ? AND (user_id = ? OR lead_id = ?)',
            [commentId, userId, leadId]
        );
        
        if (!comment) {
            return res.status(403).json({
                success: false,
                error: 'No puedes borrar este comentario'
            });
        }
        
        // Borrar comentario
        await run('DELETE FROM landing_comments WHERE id = ?', [commentId]);
        
        return res.json({
            success: true,
            message: 'Comentario eliminado'
        });
    } catch (error) {
        console.error('[Comments] Error deleting:', error);
        return res.status(500).json({
            success: false,
            error: 'Error al eliminar el comentario'
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

// ==================== PAYPAL ROUTES ====================

// Obtener configuración de PayPal para el frontend
router.get('/paypal-config', (_req, res) => {
    const config = getPayPalConfig();
    res.json({
        clientId: config.clientId,
        mode: config.mode,
        currency: config.currency
    });
});

// Crear orden de PayPal
router.post('/create-paypal-order', async (req, res) => {
    try {
        const { packageId, email, fullName } = req.body;
        
        if (!packageId || !email) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing required fields' 
            });
        }
        
        const result = await createPayPalOrder({
            packageId,
            customerEmail: email,
            customerName: fullName
        });
        
        if (result.success) {
            // Guardar el orderId en la sesión o DB temporalmente
            // Esto ayuda a trackear la orden después
            res.json({
                success: true,
                orderId: result.orderId,
                approvalUrl: result.approvalUrl
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('[PayPal] Error creating order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Capturar orden de PayPal (después de que el usuario apruebe)
router.post('/capture-paypal-order', async (req, res) => {
    try {
        const { orderId, userId } = req.body;
        
        if (!orderId) {
            return res.status(400).json({
                success: false,
                error: 'Order ID required'
            });
        }
        
        const result = await capturePayPalOrder(orderId);
        
        if (result.success) {
            // Actualizar la base de datos con la información del pago
            await run(
                `UPDATE landing_email_leads 
                 SET paypal_order_id = ?, 
                     paypal_payment_status = ?,
                     paypal_payer_email = ?,
                     interested_in_minidisc = 1
                 WHERE id = ?`,
                [result.orderId, 'captured', result.payerEmail, userId]
            );
            
            // Generar código NFC para el usuario
            const nfcData = await saveNFCCode(userId);
            
            // Obtener datos del usuario para el email
            const userData = await getOne(
                'SELECT email, full_name, country FROM landing_email_leads WHERE id = ?',
                [userId]
            );
            
            // Enviar email de confirmación
            await sendMiniDiscConfirmationEmail({
                to: userData.email,
                name: userData.full_name,
                orderId: result.orderId,
                amount: result.amount,
                nfcCode: nfcData.code,
                nfcLink: nfcData.link
            });
            
            // Sincronizar con Notion (actualizar a "Comprado")
            if (process.env.NOTION_SYNC_ENABLED === 'true' && process.env.NOTION_SYNC_ON_PURCHASE === 'true') {
                console.log('[PayPal] Sincronizando compra con Notion...');
                try {
                    const fullUserData = await getOne(
                        'SELECT * FROM landing_email_leads WHERE id = ?',
                        [userId]
                    );
                    if (fullUserData) {
                        await syncUserToNotion(fullUserData);
                        console.log('[PayPal] ✅ Notion actualizado con compra');
                    }
                } catch (notionError) {
                    console.error('[PayPal] ⚠️ Error sincronizando con Notion:', notionError.message);
                    // No fallamos si esto falla
                }
            }
            
            res.json({
                success: true,
                orderId: result.orderId,
                status: result.status,
                amount: result.amount,
                nfcCode: nfcData.code,
                nfcLink: nfcData.link
            });
        } else {
            res.status(500).json({
                success: false,
                error: result.error
            });
        }
    } catch (error) {
        console.error('[PayPal] Error capturing order:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Página de checkout dedicada (para usuarios que vienen del email)
router.get('/checkout', async (req, res) => {
    try {
        const { email, token } = req.query;
        
        if (!email || !token) {
            return res.redirect('/ei2');
        }
        
        // Buscar al usuario
        const user = await getOne(
            'SELECT id, email, full_name, country FROM landing_email_leads WHERE email = ?',
            [email]
        );
        
        if (!user) {
            return res.redirect('/ei2');
        }
        
        // Verificar si ya compró
        const existingOrder = await getOne(
            'SELECT paypal_order_id FROM landing_email_leads WHERE id = ? AND paypal_payment_status = "captured"',
            [user.id]
        );
        
        const alreadyPurchased = !!existingOrder;
        
        res.render('landing/checkout', {
            title: 'Checkout - Mini-Disc El Inmortal 2',
            user: user,
            alreadyPurchased: alreadyPurchased,
            paypalClientId: process.env.PAYPAL_CLIENT_ID,
            paypalMode: process.env.PAYPAL_MODE || 'sandbox'
        });
    } catch (error) {
        console.error('[Checkout] Error:', error);
        res.redirect('/ei2');
    }
});

// Página de éxito después del checkout
router.get('/checkout-success', (req, res) => {
    res.render('landing/checkout-success', {
        title: '¡Gracias por tu compra! - El Inmortal 2'
    });
});

// Página de cancelación
router.get('/checkout-cancel', (req, res) => {
    res.render('landing/checkout-cancel', {
        title: 'Checkout Cancelado - El Inmortal 2'
    });
});

// ==================== NFC / LINKTREE ROUTES ====================

// Página de desbloqueo NFC (cuando escanean el disco)
router.get('/unlock/:code', async (req, res) => {
    try {
        const { code } = req.params;
        
        // Buscar el usuario por código NFC
        const user = await getOne(
            'SELECT id, email, full_name, nfc_link, package_shipped, tracking_number FROM landing_email_leads WHERE nfc_unique_code = ?',
            [code]
        );
        
        if (!user) {
            return res.status(404).render('error', {
                title: 'Código no válido',
                message: 'Este código NFC no es válido o ha expirado.',
                error: {}
            });
        }
        
        res.render('landing/nfc-landing', {
            title: 'Contenido Exclusivo - El Inmortal 2',
            user: user,
            code: code,
            links: {
                spotify: 'https://open.spotify.com/artist/5SYAaCKEVYhN3RDSDKUTJn?si=g1ldaLJdQO61OY4Wk6Iz2A',
                appleMusic: 'https://music.apple.com/us/artist/galante-el-emperador/415956668',
                youtube: 'https://www.youtube.com/@galanteelemperador',
                instagram: 'https://instagram.com/galanteddm',
                twitter: 'https://twitter.com/galantealx'
            }
        });
    } catch (error) {
        console.error('[NFC] Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando contenido exclusivo.',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// ==================== ADMIN ROUTES ====================

// Panel de configuración del landing
router.get('/admin/config', async (req, res) => {
    // Verificar si es admin
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    try {
        const stats = await getUnifiedStats();
        
        res.render('landing/admin-config', {
            title: 'Configuración Landing - El Inmortal 2',
            stats: stats,
            config: {
                paypalMode: process.env.PAYPAL_MODE || 'sandbox',
                fakeStockCount: 47,
                stockDisplayMode: 'fake'
            }
        });
    } catch (error) {
        console.error('[Admin] Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando configuración.',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Actualizar configuración
router.post('/admin/config/update', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { stockDisplayMode, fakeStockCount, notificationsEnabled, notificationFrequency } = req.body;
        
        // Aquí podrías guardar en DB, por ahora solo log
        console.log('[Admin] Configuración actualizada:', {
            stockDisplayMode,
            fakeStockCount,
            notificationsEnabled,
            notificationFrequency
        });
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== DEBUG ROUTES ====================

// Endpoint de diagnóstico temporal
router.get('/debug', async (req, res) => {
    try {
        const diagnostics = {
            timestamp: new Date().toISOString(),
            node_version: process.version,
            env_vars: {
                DB_HOST: process.env.DB_HOST ? '✅ Configurado' : '❌ No configurado',
                DB_NAME: process.env.DB_NAME ? '✅ Configurado' : '❌ No configurado',
                PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID ? '✅ Configurado' : '❌ No configurado',
                PAYPAL_SECRET: process.env.PAYPAL_SECRET ? '✅ Configurado' : '❌ No configurado',
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
        
        // Probar PayPal helper
        try {
            const paypalHelper = require('../utils/paypalHelper');
            diagnostics.paypal_helper = '✅ Cargado correctamente';
            diagnostics.paypal_mode = process.env.PAYPAL_MODE || 'sandbox';
        } catch (helperError) {
            diagnostics.paypal_helper = `❌ Error: ${helperError.message}`;
        }
        
        res.json(diagnostics);
    } catch (error) {
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// ==================== EXPORT ROUTES ====================

// Vista de admin para ver usuarios (HTML)
router.get('/admin/users', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/login');
    }
    
    try {
        const { getFunnelStep } = require('../utils/exportUsers');
        
        const users = await getAll(`
            SELECT 
                id, email, full_name, country, created_at,
                interested_in_minidisc, paypal_order_id, paypal_payment_status,
                minidisc_email_sent, minidisc_email_sent_at,
                nfc_unique_code, package_shipped, tracking_number
            FROM landing_email_leads
            ORDER BY created_at DESC
            LIMIT 100
        `);
        
        const usersWithFunnel = users.map(user => ({
            ...user,
            funnel: getFunnelStep(user)
        }));
        
        // Calculate stats
        const stats = {
            total: users.length,
            registered: users.length,
            emailSent: users.filter(u => u.minidisc_email_sent).length,
            interested: users.filter(u => u.interested_in_minidisc).length,
            checkoutStarted: users.filter(u => u.paypal_order_id && !u.paypal_payment_status).length,
            purchased: users.filter(u => u.paypal_payment_status === 'captured').length,
            shipped: users.filter(u => u.package_shipped).length
        };
        
        res.render('landing/admin-users', {
            title: 'Usuarios - El Inmortal 2',
            users: usersWithFunnel,
            stats
        });
    } catch (error) {
        console.error('[Admin Users] Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando usuarios.',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Exportar a CSV
router.get('/admin/export/csv', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { exportToCSV } = require('../utils/exportUsers');
        const result = await exportToCSV();
        
        if (result.success) {
            res.download(result.filepath, result.filename);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Exportar a JSON
router.get('/admin/export/json', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { exportToJSON } = require('../utils/exportUsers');
        const result = await exportToJSON();
        
        if (result.success) {
            res.download(result.filepath, result.filename);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// API para obtener usuarios (JSON)
router.get('/admin/api/users', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { getFunnelStep } = require('../utils/exportUsers');
        
        const users = await getAll(`
            SELECT 
                id, email, full_name, country, created_at,
                interested_in_minidisc, paypal_order_id, paypal_payment_status,
                minidisc_email_sent, minidisc_email_sent_at,
                nfc_unique_code, package_shipped, tracking_number
            FROM landing_email_leads
            ORDER BY created_at DESC
        `);
        
        const usersWithFunnel = users.map(user => ({
            ...user,
            funnel: getFunnelStep(user)
        }));
        
        res.json({
            success: true,
            count: users.length,
            users: usersWithFunnel
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== NOTION INTEGRATION ROUTES ====================

// Verificar estado de integración con Notion
router.get('/admin/notion/status', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const configured = isNotionConfigured();
        let stats = null;
        
        if (configured) {
            const notionStats = await getNotionStats();
            if (notionStats.success) {
                stats = notionStats.stats;
            }
        }
        
        res.json({
            success: true,
            configured: configured,
            syncEnabled: process.env.NOTION_SYNC_ENABLED === 'true',
            syncOnRegister: process.env.NOTION_SYNC_ON_REGISTER === 'true',
            syncOnPurchase: process.env.NOTION_SYNC_ON_PURCHASE === 'true',
            stats: stats
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sincronizar un usuario específico con Notion
router.post('/admin/notion/sync-user', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ success: false, error: 'User ID required' });
        }
        
        const userData = await getOne(
            'SELECT * FROM landing_email_leads WHERE id = ?',
            [userId]
        );
        
        if (!userData) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }
        
        const result = await syncUserToNotion(userData);
        
        if (result.success) {
            res.json({
                success: true,
                message: `User ${userData.email} synchronized successfully`,
                pageId: result.pageId,
                action: result.action,
                url: result.url
            });
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Sincronizar TODOS los usuarios con Notion (bulk)
router.post('/admin/notion/sync-all', async (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    
    try {
        const result = await syncAllUsersToNotion();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'All users synchronized successfully',
                total: result.total,
                created: result.created,
                updated: result.updated,
                errors: result.errors
            });
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
