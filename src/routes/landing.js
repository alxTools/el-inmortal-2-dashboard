const express = require('express');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, query, run } = require('../config/database');

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

async function ensureLandingLeadsTable() {
    await query(
        `CREATE TABLE IF NOT EXISTS landing_email_leads (
            id BIGINT NOT NULL AUTO_INCREMENT,
            email VARCHAR(255) NOT NULL,
            full_name VARCHAR(255) NULL,
            country VARCHAR(120) NULL,
            source_label VARCHAR(128) NOT NULL DEFAULT 'landing_el_inmortal_2',
            ip_address VARCHAR(64) NULL,
            user_agent VARCHAR(255) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_email (email),
            KEY idx_country (country),
            KEY idx_source (source_label)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );

    const columns = await getAll(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = 'landing_email_leads'`
    );
    const columnSet = new Set(columns.map((row) => row.column_name));

    if (!columnSet.has('full_name')) {
        await query('ALTER TABLE landing_email_leads ADD COLUMN full_name VARCHAR(255) NULL');
    }
    if (!columnSet.has('country')) {
        await query('ALTER TABLE landing_email_leads ADD COLUMN country VARCHAR(120) NULL');
    }
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

router.get('/', (_req, res) => {
    return res.redirect('/landing/el-inmortal-2');
});

router.get('/el-inmortal-2', async (_req, res) => {
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
        return {
            trackNumber: Number(fallback.trackNumber || idx + 1),
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
});

router.post('/subscribe', async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const fullName = String(req.body.full_name || req.body.name || '').trim();
    const country = String(req.body.country || '').trim();
    const sourceLabel = String(req.body.source || 'landing_el_inmortal_2').trim() || 'landing_el_inmortal_2';
    const wantsJson =
        req.is('application/json') ||
        String(req.headers.accept || '').includes('application/json');

    if (!fullName || !country) {
        if (!wantsJson) {
            return res.redirect('/landing/el-inmortal-2?unlock=0');
        }
        return res.status(400).json({ success: false, error: 'missing_fields' });
    }

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        if (!wantsJson) {
            return res.redirect('/landing/el-inmortal-2?unlock=0');
        }
        return res.status(400).json({ success: false, error: 'email_invalid' });
    }

    try {
        await ensureLandingLeadsTable();

        await run(
            `INSERT INTO landing_email_leads (email, full_name, country, source_label, ip_address, user_agent)
             VALUES (?, ?, ?, ?, ?, ?)`
            ,
            [
                email,
                fullName,
                country,
                sourceLabel,
                req.ip,
                String(req.headers['user-agent'] || '').slice(0, 255)
            ]
        );

        if (!wantsJson) {
            return res.redirect('/landing/el-inmortal-2?unlock=1');
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('Landing subscribe error:', error);
        if (!wantsJson) {
            return res.redirect('/landing/el-inmortal-2?unlock=0');
        }
        return res.status(500).json({ success: false, error: 'server_error' });
    }
});

router.get('/stats', async (_req, res) => {
    try {
        await ensureLandingLeadsTable();

        const topCountries = await getAll(
            `SELECT country, COUNT(*) AS total
             FROM landing_email_leads
             WHERE country IS NOT NULL AND country <> ''
             GROUP BY country
             ORDER BY total DESC
             LIMIT 6`
        );

        const total = await getOne('SELECT COUNT(*) AS total FROM landing_email_leads');
        return res.json({
            totalLeads: total?.total || 0,
            topCountries: topCountries || []
        });
    } catch (error) {
        console.error('Landing stats error:', error);
        return res.status(500).json({ error: 'stats_error' });
    }
});

module.exports = router;
