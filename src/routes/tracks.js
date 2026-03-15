const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { getAll, getOne, run } = require('../config/database');
const { analyzeAndDescribeAudio } = require('../utils/audioHelper');
const { ensureTrackProjectZipColumns } = require('../utils/trackProjectZipSchema');

// Configurar multer para subida de audio
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads/audio');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitized}`);
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100MB max
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('audio/') || 
            file.originalname.match(/\.(wav|mp3|m4a|flac|aac)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de audio'), false);
        }
    }
});

function toPositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeIdArray(value) {
    const rawValues = Array.isArray(value)
        ? value
        : (value === undefined || value === null || value === '' ? [] : [value]);

    const ids = rawValues
        .map(toPositiveInt)
        .filter(Boolean);

    return [...new Set(ids)];
}

function normalizeDurationText(value) {
    if (value === undefined || value === null || value === '') return null;

    const formatSeconds = (secondsValue) => {
        const total = Math.max(0, Math.round(secondsValue));
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    if (typeof value === 'number' && Number.isFinite(value)) {
        return formatSeconds(value);
    }

    const text = String(value).trim();
    if (!text) return null;

    const mmssMatch = text.match(/^(\d+):([0-5]\d)$/);
    if (mmssMatch) {
        const minutes = Number(mmssMatch[1]);
        const seconds = Number(mmssMatch[2]);
        return formatSeconds((minutes * 60) + seconds);
    }

    const parsed = Number(text.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }

    return formatSeconds(parsed);
}

function normalizeOptionalText(value, maxLength = 1000) {
    if (value === undefined || value === null) return null;
    const text = String(value).trim();
    if (!text) return null;
    return text.slice(0, maxLength);
}

function normalizeOptionalFileSize(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return null;
    }
    return Math.round(parsed);
}

async function ensureTrackCreditsTables() {
    await run(`
        CREATE TABLE IF NOT EXISTS track_producers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            track_id INT NOT NULL,
            producer_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_track_producers_track (track_id),
            INDEX idx_track_producers_producer (producer_id),
            UNIQUE KEY uniq_track_producer (track_id, producer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS track_composers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            track_id INT NOT NULL,
            composer_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_track_composers_track (track_id),
            INDEX idx_track_composers_composer (composer_id),
            UNIQUE KEY uniq_track_composer (track_id, composer_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function filterExistingIds(tableName, ids) {
    if (!ids.length) return [];

    const allowedTables = new Set(['producers', 'composers']);
    if (!allowedTables.has(tableName)) {
        throw new Error('Invalid table for id filtering');
    }

    const placeholders = ids.map(() => '?').join(', ');
    const rows = await getAll(`SELECT id FROM ${tableName} WHERE id IN (${placeholders})`, ids);
    const validSet = new Set(rows.map((row) => Number(row.id)));
    return ids.filter((id) => validSet.has(id));
}

async function getTrackCreditIds(trackId) {
    await ensureTrackCreditsTables();

    const producerRows = await getAll(
        'SELECT producer_id FROM track_producers WHERE track_id = ? ORDER BY id',
        [trackId]
    );
    const composerRows = await getAll(
        'SELECT composer_id FROM track_composers WHERE track_id = ? ORDER BY id',
        [trackId]
    );

    return {
        additionalProducerIds: normalizeIdArray(producerRows.map((row) => row.producer_id)),
        composerIds: normalizeIdArray(composerRows.map((row) => row.composer_id))
    };
}

async function syncTrackCredits(trackId, { primaryProducerId, additionalProducerIds, composerIds }) {
    await ensureTrackCreditsTables();

    const normalizedPrimary = toPositiveInt(primaryProducerId);
    const validAdditionalProducers = await filterExistingIds('producers', normalizeIdArray(additionalProducerIds));
    const validComposers = await filterExistingIds('composers', normalizeIdArray(composerIds));

    const filteredAdditionalProducers = validAdditionalProducers.filter((producerId) => producerId !== normalizedPrimary);

    await run('DELETE FROM track_producers WHERE track_id = ?', [trackId]);
    for (const producerId of filteredAdditionalProducers) {
        await run(
            'INSERT IGNORE INTO track_producers (track_id, producer_id) VALUES (?, ?)',
            [trackId, producerId]
        );
    }

    await run('DELETE FROM track_composers WHERE track_id = ?', [trackId]);
    for (const composerId of validComposers) {
        await run(
            'INSERT IGNORE INTO track_composers (track_id, composer_id) VALUES (?, ?)',
            [trackId, composerId]
        );
    }

    return {
        primaryProducerId: normalizedPrimary,
        additionalProducerIds: filteredAdditionalProducers,
        composerIds: validComposers
    };
}

// GET all tracks
router.get('/', async (req, res) => {
    try {
        const filter = req.query.filter;
        
        let sql = `
            SELECT t.*, p.name as producer_name, p.email as producer_email
            FROM tracks t
            LEFT JOIN producers p ON t.producer_id = p.id
        `;
        
        const params = [];
        
        // Apply filters
        if (filter === 'singles') {
            sql += ' WHERE t.is_single = 1';
        } else if (filter === 'primary') {
            sql += ' WHERE t.is_primary = 1';
        } else if (filter === 'album') {
            sql += ' WHERE t.is_single = 0 AND t.is_primary = 0';
        } else if (filter === 'pending') {
            sql += ' WHERE t.splitsheet_confirmed = 0';
        }
        
        sql += ' ORDER BY t.track_number';
        
        const tracks = await getAll(sql, params);

        res.render('tracks/index', {
            title: 'Lista de Temas - El Inmortal 2',
            tracks: tracks || [],
            currentFilter: filter
        });
    } catch (error) {
        console.error('Error fetching tracks:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando los temas',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET new track form
router.get('/new', async (req, res) => {
    try {
        await ensureTrackProjectZipColumns();
        const producers = await getAll('SELECT * FROM producers ORDER BY name');

        res.render('tracks/new', {
            title: 'Nuevo Tema - El Inmortal 2',
            producers: producers || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando formulario',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// POST create new track
router.post('/', upload.single('audio_file'), [
    body('track_number').isInt({ min: 1, max: 21 }),
    body('title').trim().notEmpty(),
    body('producer_id').optional().isInt()
], async (req, res) => {
    await ensureTrackProjectZipColumns();

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const producers = await getAll('SELECT * FROM producers ORDER BY name');
        return res.status(400).render('tracks/new', {
            title: 'Nuevo Tema',
            errors: errors.array(),
            formData: req.body,
            producers: producers || []
        });
    }

    try {
        const {
            track_number,
            title,
            producer_id,
            recording_date,
            duration,
            lyrics,
            project_zip_drive_file_id,
            project_zip_drive_download_url,
            project_zip_drive_view_url,
            project_zip_original_name,
            project_zip_file_size
        } = req.body;
        const normalizedFormDuration = normalizeDurationText(duration);

        const projectZipDriveFileId = normalizeOptionalText(project_zip_drive_file_id, 255);
        const hasProjectZip = Boolean(projectZipDriveFileId);
        const projectZipDownloadUrl = hasProjectZip
            ? (
                normalizeOptionalText(project_zip_drive_download_url, 2000) ||
                `https://drive.google.com/uc?export=download&id=${projectZipDriveFileId}`
            )
            : null;
        const projectZipViewUrl = hasProjectZip
            ? (
                normalizeOptionalText(project_zip_drive_view_url, 2000) ||
                `https://drive.google.com/file/d/${projectZipDriveFileId}/view`
            )
            : null;
        const projectZipOriginalName = hasProjectZip
            ? (normalizeOptionalText(project_zip_original_name, 500) || 'project-data.zip')
            : null;
        const projectZipFileSize = hasProjectZip
            ? normalizeOptionalFileSize(project_zip_file_size)
            : null;
        const projectZipUploadedAt = hasProjectZip ? new Date() : null;
        
        // Si se subió audio, procesarlo
        let audioFilePath = null;
        let detectedDuration = null;
        let audioDescription = null;
        
        if (req.file) {
            audioFilePath = `/uploads/audio/${req.file.filename}`;
            const localFilePath = req.file.path;
            
            // Obtener productor para la descripción
            let producerName = 'El Inmortal 2 Team';
            if (producer_id) {
                const producer = await getOne('SELECT name FROM producers WHERE id = ?', [producer_id]);
                if (producer) producerName = producer.name;
            }
            
            // Analizar audio y generar descripción
            try {
                console.log(`[Tracks] Analyzing audio for: ${title}`);
                const analysis = await analyzeAndDescribeAudio(localFilePath, title, producerName);
                detectedDuration = normalizeDurationText(analysis.duration);
                audioDescription = analysis.description;
                console.log(`[Tracks] ✅ Audio analyzed - Duration: ${detectedDuration}`);
            } catch (analysisError) {
                console.warn(`[Tracks] Could not analyze audio: ${analysisError.message}`);
            }
        }

        const durationToSave = detectedDuration ?? normalizedFormDuration;

        await run(
            `INSERT INTO tracks (
                track_number,
                title,
                producer_id,
                recording_date,
                duration,
                lyrics,
                audio_file_path,
                audio_file_type,
                audio_description,
                project_zip_drive_file_id,
                project_zip_drive_download_url,
                project_zip_drive_view_url,
                project_zip_original_name,
                project_zip_file_size,
                project_zip_uploaded_at
            )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                track_number,
                title,
                producer_id || null,
                recording_date,
                durationToSave,
                lyrics,
                audioFilePath,
                audioFilePath ? 'master' : null,
                audioDescription,
                projectZipDriveFileId,
                projectZipDownloadUrl,
                projectZipViewUrl,
                projectZipOriginalName,
                projectZipFileSize,
                projectZipUploadedAt
            ]
        );

        res.redirect('/tracks');
    } catch (error) {
        console.error('Error creating track:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error creando el tema',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET show track details
router.get('/:id', async (req, res) => {
    try {
        const trackId = req.params.id;
        
        const track = await getOne('SELECT t.*, p.name as producer_name FROM tracks t LEFT JOIN producers p ON t.producer_id = p.id WHERE t.id = ?', [trackId]);
        
        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }
        
        res.render('tracks/show', {
            title: track.title,
            track: track
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando tema',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET edit track form
router.get('/:id/edit', async (req, res) => {
    try {
        const trackId = req.params.id;

        await ensureTrackCreditsTables();
        await ensureTrackProjectZipColumns();

        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [trackId]);

        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }

        const producers = await getAll('SELECT * FROM producers ORDER BY name');
        const composers = await getAll('SELECT * FROM composers ORDER BY name');
        const additionalProducers = await getAll(
            `SELECT p.id, p.name
             FROM track_producers tp
             JOIN producers p ON p.id = tp.producer_id
             WHERE tp.track_id = ?
             ORDER BY p.name`,
            [trackId]
        );
        const selectedComposers = await getAll(
            `SELECT c.id, c.name
             FROM track_composers tc
             JOIN composers c ON c.id = tc.composer_id
             WHERE tc.track_id = ?
             ORDER BY c.name`,
            [trackId]
        );

        res.render('tracks/edit', {
            title: `Editar: ${track.title}`,
            track: track,
            producers: producers || [],
            composers: composers || [],
            additionalProducers: additionalProducers || [],
            selectedComposers: selectedComposers || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando tema',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// PUT update track
router.put('/:id', async (req, res) => {
    try {
        const trackId = req.params.id;
        const {
            title,
            producer_id,
            recording_date,
            duration,
            lyrics,
            status,
            is_single,
            is_primary,
            track_type,
            additional_producer_ids,
            composer_ids
        } = req.body;

        const track = await getOne('SELECT id, duration FROM tracks WHERE id = ?', [trackId]);
        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }

        const primaryProducerId = toPositiveInt(producer_id);
        const rawDurationText = duration === undefined || duration === null ? '' : String(duration).trim();
        const parsedDuration = normalizeDurationText(rawDurationText);
        const durationToSave = rawDurationText === ''
            ? null
            : (parsedDuration !== null ? parsedDuration : normalizeDurationText(track.duration));

        await run(
            `UPDATE tracks 
             SET title = ?, producer_id = ?, recording_date = ?, 
                 duration = ?, lyrics = ?, status = ?, 
                 is_single = ?, is_primary = ?, track_type = ?
             WHERE id = ?`,
            [
                title, 
                primaryProducerId, 
                recording_date || null, 
                durationToSave,
                lyrics, 
                status, 
                is_single ? 1 : 0, 
                is_primary ? 1 : 0, 
                track_type || 'album', 
                trackId
            ]
        );

        await syncTrackCredits(trackId, {
            primaryProducerId,
            additionalProducerIds: normalizeIdArray(additional_producer_ids),
            composerIds: normalizeIdArray(composer_ids)
        });

        res.redirect('/tracks');
    } catch (error) {
        console.error('Error updating track:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando el tema',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// POST auto-generate splitsheets for a track based on assigned producers
router.post('/:id/auto-generate-splitsheets', async (req, res) => {
    try {
        const trackId = req.params.id;
        const track = await getOne('SELECT id, title, producer_id FROM tracks WHERE id = ?', [trackId]);

        if (!track) {
            return res.status(404).json({ error: 'Tema no encontrado' });
        }

        const payload = req.body || {};
        const hasCreditsPayload =
            payload.producer_id !== undefined ||
            payload.additional_producer_ids !== undefined ||
            payload.composer_ids !== undefined;

        const existingCredits = await getTrackCreditIds(trackId);

        let primaryProducerId = toPositiveInt(track.producer_id);
        let additionalProducerIds = existingCredits.additionalProducerIds;
        let composerIds = existingCredits.composerIds;

        if (hasCreditsPayload) {
            if (payload.producer_id !== undefined) {
                primaryProducerId = toPositiveInt(payload.producer_id);
                await run('UPDATE tracks SET producer_id = ? WHERE id = ?', [primaryProducerId, trackId]);
            }
            if (payload.additional_producer_ids !== undefined) {
                additionalProducerIds = normalizeIdArray(payload.additional_producer_ids);
            }
            if (payload.composer_ids !== undefined) {
                composerIds = normalizeIdArray(payload.composer_ids);
            }

            const synced = await syncTrackCredits(trackId, {
                primaryProducerId,
                additionalProducerIds,
                composerIds
            });

            primaryProducerId = synced.primaryProducerId;
            additionalProducerIds = synced.additionalProducerIds;
        }

        const producerIdsForSheet = [...new Set([
            ...(primaryProducerId ? [primaryProducerId] : []),
            ...normalizeIdArray(additionalProducerIds)
        ])];

        const validProducerIds = await filterExistingIds('producers', producerIdsForSheet);

        if (!validProducerIds.length) {
            return res.status(422).json({
                error: 'No hay productores asignados para generar splitsheets'
            });
        }

        await run(`
            CREATE TABLE IF NOT EXISTS splitsheets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                track_id INT NOT NULL,
                producer_id INT NOT NULL,
                artist_percentage INT DEFAULT 50,
                producer_percentage INT DEFAULT 50,
                document_path VARCHAR(500),
                sent_date DATETIME,
                confirmed_date DATETIME,
                status VARCHAR(50) DEFAULT 'pending',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_splitsheets_track (track_id),
                INDEX idx_splitsheets_producer (producer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await run('DELETE FROM splitsheets WHERE track_id = ?', [trackId]);

        const artistPercentage = 50;
        const producerPool = 50;
        const baseShare = Math.floor(producerPool / validProducerIds.length);
        let remainder = producerPool - (baseShare * validProducerIds.length);

        for (const producerId of validProducerIds) {
            const producerPercentage = baseShare + (remainder > 0 ? 1 : 0);
            if (remainder > 0) remainder -= 1;

            await run(
                `INSERT INTO splitsheets (track_id, producer_id, artist_percentage, producer_percentage, status, notes)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    trackId,
                    producerId,
                    artistPercentage,
                    producerPercentage,
                    'pending',
                    'Auto-generado desde Track Editor'
                ]
            );
        }

        await run(
            'UPDATE tracks SET splitsheet_sent = 1, splitsheet_confirmed = 0 WHERE id = ?',
            [trackId]
        );

        try {
            await run(
                'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)',
                [
                    'SPLITSHEET_AUTO_GENERATE',
                    'track',
                    trackId,
                    `Splitsheets auto-generados para ${validProducerIds.length} productor(es)`
                ]
            );
        } catch (logError) {
            console.warn('Could not log auto-generate splitsheet activity:', logError.message);
        }

        const placeholders = validProducerIds.map(() => '?').join(', ');
        const producers = await getAll(
            `SELECT id, name, email FROM producers WHERE id IN (${placeholders}) ORDER BY name`,
            validProducerIds
        );

        return res.json({
            success: true,
            message: `Splitsheets generados para ${validProducerIds.length} productor(es)`,
            trackId: Number(trackId),
            trackTitle: track.title,
            producerCount: validProducerIds.length,
            producers
        });
    } catch (error) {
        console.error('Error auto-generating splitsheets:', error);
        return res.status(500).json({
            error: 'Error generando splitsheets automáticamente',
            details: error.message
        });
    }
});

// DELETE track
router.delete('/:id', async (req, res) => {
    try {
        const trackId = req.params.id;

        await run('DELETE FROM tracks WHERE id = ?', [trackId]);

        res.json({ success: true, message: 'Tema eliminado' });
    } catch (error) {
        console.error('Error deleting track:', error);
        res.status(500).json({ success: false, message: 'Error eliminando tema' });
    }
});

module.exports = router;
