const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');
const nodemailer = require('nodemailer');

function toPercentage(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 100) return null;
    return rounded;
}

function toPositiveInt(value) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function toArray(value) {
    if (Array.isArray(value)) return value;
    if (value === undefined || value === null) return [];
    return [value];
}

function getBodyField(body, key) {
    if (Object.prototype.hasOwnProperty.call(body, key)) return body[key];
    const withBrackets = `${key}[]`;
    if (Object.prototype.hasOwnProperty.call(body, withBrackets)) return body[withBrackets];
    return undefined;
}

function normalizeIdArray(value) {
    return [...new Set(
        toArray(value)
            .map(toPositiveInt)
            .filter(Boolean)
    )];
}

function parseProducerSplitEntries(body) {
    const producerIdsRaw = toArray(getBodyField(body, 'producer_ids'));
    const producerPercentagesRaw = toArray(getBodyField(body, 'producer_percentages'));
    const maxLen = Math.max(producerIdsRaw.length, producerPercentagesRaw.length);
    const entries = [];

    for (let i = 0; i < maxLen; i += 1) {
        const idRaw = producerIdsRaw[i];
        const pctRaw = producerPercentagesRaw[i];
        const isEmptyId = idRaw === undefined || idRaw === null || String(idRaw).trim() === '';
        const isEmptyPct = pctRaw === undefined || pctRaw === null || String(pctRaw).trim() === '';

        if (isEmptyId && isEmptyPct) {
            continue;
        }

        const producerId = toPositiveInt(idRaw);
        const producerPercentage = toPercentage(pctRaw);

        if (!producerId) {
            return { entries: [], error: 'Todos los productores deben ser válidos.' };
        }
        if (producerPercentage === null) {
            return { entries: [], error: 'Todos los porcentajes de productores deben estar entre 0 y 100.' };
        }

        entries.push({ producerId, producerPercentage });
    }

    const uniqueIds = new Set(entries.map((entry) => entry.producerId));
    if (uniqueIds.size !== entries.length) {
        return { entries: [], error: 'No repitas el mismo productor en el mismo splitsheet.' };
    }

    return { entries, error: '' };
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

async function getSplitsheetById(splitsheetId) {
    return await getOne(
        `SELECT
            s.*,
            t.title AS track_title,
            t.track_number,
            p.name AS producer_name,
            p.email AS producer_email
         FROM splitsheets s
         JOIN tracks t ON s.track_id = t.id
         JOIN producers p ON s.producer_id = p.id
         WHERE s.id = ?`,
        [splitsheetId]
    );
}

async function getSplitsheetsByTrackId(trackId) {
    return await getAll(
        `SELECT
            s.*,
            p.name AS producer_name,
            p.email AS producer_email
         FROM splitsheets s
         JOIN producers p ON p.id = s.producer_id
         WHERE s.track_id = ?
         ORDER BY s.id ASC`,
        [trackId]
    );
}

async function syncTrackSplitsheetFlags(trackId) {
    const summary = await getOne(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
         FROM splitsheets
         WHERE track_id = ?`,
        [trackId]
    );

    const total = Number(summary?.total || 0);
    const confirmed = Number(summary?.confirmed || 0);

    const splitsheetSent = total > 0 ? 1 : 0;
    const splitsheetConfirmed = total > 0 && confirmed === total ? 1 : 0;

    await run(
        'UPDATE tracks SET splitsheet_sent = ?, splitsheet_confirmed = ? WHERE id = ?',
        [splitsheetSent, splitsheetConfirmed, trackId]
    );
}

// GET splitsheets dashboard
router.get('/', async (req, res) => {
    try {
        const splitsheets = await getAll(`
            SELECT s.*, t.title as track_title, t.track_number, p.name as producer_name, p.email as producer_email
            FROM splitsheets s
            JOIN tracks t ON s.track_id = t.id
            JOIN producers p ON s.producer_id = p.id
            ORDER BY s.created_at DESC
        `);

        res.render('splitsheets/index', {
            title: 'Splitsheets - El Inmortal 2',
            splitsheets: splitsheets || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando splitsheets',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET generate splitsheet for a track
router.get('/generate/:trackId', async (req, res) => {
    try {
        const trackId = req.params.trackId;

        const track = await getOne(`
            SELECT t.*, p.name as producer_name, p.legal_name as producer_legal_name, 
                   p.email as producer_email, p.split_percentage
            FROM tracks t
            JOIN producers p ON t.producer_id = p.id
            WHERE t.id = ?
        `, [trackId]);

        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Track no encontrado',
                error: {}
            });
        }

        res.render('splitsheets/generate', {
            title: `Generar Splitsheet - ${track.title}`,
            track: track
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error generando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET edit a splitsheet
router.get('/:id/edit', async (req, res) => {
    try {
        const splitsheet = await getSplitsheetById(req.params.id);

        if (!splitsheet) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Splitsheet no encontrado',
                error: {}
            });
        }

        await ensureTrackCreditsTables();

        const producers = await getAll('SELECT id, name, email FROM producers ORDER BY name');
        const composers = await getAll('SELECT id, name, email FROM composers ORDER BY name');
        const producerSplits = await getSplitsheetsByTrackId(splitsheet.track_id);
        const selectedComposers = await getAll(
            `SELECT c.id, c.name
             FROM track_composers tc
             JOIN composers c ON c.id = tc.composer_id
             WHERE tc.track_id = ?
             ORDER BY c.name`,
            [splitsheet.track_id]
        );

        const artistPercentage = Number(producerSplits[0]?.artist_percentage || splitsheet.artist_percentage || 50);
        const status = String(producerSplits[0]?.status || splitsheet.status || 'pending');
        const notes = String(producerSplits[0]?.notes || splitsheet.notes || '');

        return res.render('splitsheets/edit', {
            title: `Editar Splitsheet - ${splitsheet.track_title}`,
            splitsheet,
            producers,
            composers,
            producerSplits,
            selectedComposers,
            artistPercentage,
            status,
            notes,
            validationError: ''
        });
    } catch (error) {
        console.error('Error loading splitsheet edit form:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// PUT update splitsheet percentages and status
router.put('/:id', async (req, res) => {
    try {
        const splitsheetId = req.params.id;
        const existing = await getSplitsheetById(splitsheetId);

        if (!existing) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Splitsheet no encontrado',
                error: {}
            });
        }

        await ensureTrackCreditsTables();

        const artistPercentage = toPercentage(req.body.artist_percentage);
        const status = String(req.body.status || 'pending').trim();
        const notes = String(req.body.notes || '').trim();
        const composerIds = normalizeIdArray(getBodyField(req.body, 'composer_ids'));

        const hasProducerArrayPayload = getBodyField(req.body, 'producer_ids') !== undefined;
        const producerPayload = parseProducerSplitEntries(req.body);
        const producerEntries = hasProducerArrayPayload
            ? producerPayload.entries
            : [{
                producerId: toPositiveInt(existing.producer_id),
                producerPercentage: toPercentage(req.body.producer_percentage)
            }];

        const allowedStatuses = new Set(['pending', 'sent', 'confirmed']);
        const totalProducerPercentage = producerEntries.reduce((sum, row) => sum + Number(row.producerPercentage || 0), 0);

        let validationError = '';
        if (producerPayload.error) {
            validationError = producerPayload.error;
        } else if (artistPercentage === null) {
            validationError = 'El porcentaje del artista debe estar entre 0 y 100.';
        } else if (!producerEntries.length) {
            validationError = 'Agrega al menos un productor para el splitsheet.';
        } else if (producerEntries.some((entry) => !entry.producerId || entry.producerPercentage === null)) {
            validationError = 'Todos los productores y porcentajes deben ser válidos.';
        } else if ((artistPercentage + totalProducerPercentage) !== 100) {
            validationError = 'La suma de Artista + Productores debe ser 100%.';
        } else if (!allowedStatuses.has(status)) {
            validationError = 'Estado inválido.';
        }

        const producerIds = [...new Set(producerEntries.map((entry) => entry.producerId))];
        const validProducerIds = await filterExistingIds('producers', producerIds);
        const validComposerIds = await filterExistingIds('composers', composerIds);

        if (!validationError && validProducerIds.length !== producerIds.length) {
            validationError = 'Uno o más productores seleccionados no existen.';
        }
        if (!validationError && validComposerIds.length !== composerIds.length) {
            validationError = 'Uno o más compositores seleccionados no existen.';
        }

        const producers = await getAll('SELECT id, name, email FROM producers ORDER BY name');
        const composers = await getAll('SELECT id, name, email FROM composers ORDER BY name');

        const producerSplitsForView = producerEntries.map((entry, idx) => ({
            id: `tmp-${idx}`,
            producer_id: entry.producerId,
            producer_percentage: entry.producerPercentage,
            artist_percentage: artistPercentage,
            status,
            notes,
            producer_name: producers.find((p) => Number(p.id) === Number(entry.producerId))?.name || ''
        }));
        const selectedComposersForView = composers.filter((composer) => validComposerIds.includes(Number(composer.id)));

        if (validationError) {
            return res.status(422).render('splitsheets/edit', {
                title: `Editar Splitsheet - ${existing.track_title}`,
                splitsheet: existing,
                producers,
                composers,
                producerSplits: producerSplitsForView,
                selectedComposers: selectedComposersForView,
                artistPercentage: req.body.artist_percentage,
                status,
                notes,
                validationError
            });
        }

        const sentDate = (status === 'sent' || status === 'confirmed') ? new Date() : null;
        const confirmedDate = status === 'confirmed' ? new Date() : null;

        await run('DELETE FROM splitsheets WHERE track_id = ?', [existing.track_id]);
        for (const row of producerEntries) {
            await run(
                `INSERT INTO splitsheets
                 (track_id, producer_id, artist_percentage, producer_percentage, status, notes, sent_date, confirmed_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    existing.track_id,
                    row.producerId,
                    artistPercentage,
                    row.producerPercentage,
                    status,
                    notes || null,
                    sentDate,
                    confirmedDate
                ]
            );
        }

        const primaryProducerId = producerEntries[0]?.producerId || null;
        await run('UPDATE tracks SET producer_id = ? WHERE id = ?', [primaryProducerId, existing.track_id]);

        await run('DELETE FROM track_producers WHERE track_id = ?', [existing.track_id]);
        const additionalProducerIds = producerEntries.slice(1).map((row) => row.producerId);
        for (const producerId of additionalProducerIds) {
            await run(
                'INSERT IGNORE INTO track_producers (track_id, producer_id) VALUES (?, ?)',
                [existing.track_id, producerId]
            );
        }

        await run('DELETE FROM track_composers WHERE track_id = ?', [existing.track_id]);
        for (const composerId of validComposerIds) {
            await run(
                'INSERT IGNORE INTO track_composers (track_id, composer_id) VALUES (?, ?)',
                [existing.track_id, composerId]
            );
        }

        await run(
            'INSERT INTO activity_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)',
            [
                'SPLITSHEET_UPDATE',
                'track',
                existing.track_id,
                `Splitsheet actualizado: ${producerEntries.length} productor(es), ${validComposerIds.length} compositor(es)`
            ]
        );

        await syncTrackSplitsheetFlags(existing.track_id);

        return res.redirect('/splitsheets');
    } catch (error) {
        console.error('Error updating splitsheet:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// POST send splitsheet via email
router.post('/:trackId/send', async (req, res) => {
    try {
        const trackId = req.params.trackId;
        const { producerEmail, artistEmail, message } = req.body;
        
        // Get track and producer info
        const track = await getOne(`
            SELECT t.*, p.name as producer_name, p.email as producer_db_email
            FROM tracks t
            JOIN producers p ON t.producer_id = p.id
            WHERE t.id = ?
        `, [trackId]);
        
        if (!track) {
            return res.status(404).json({ error: 'Track no encontrado' });
        }
        
        // Use provided emails or fallbacks
        const toProducer = producerEmail || track.producer_db_email;
        const toArtist = artistEmail || 'galante@el-emperador.com';
        
        if (!toProducer) {
            return res.status(400).json({ error: 'Email del productor no disponible' });
        }
        
        // Create email transporter (configure with your SMTP settings)
        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        
        const splitsheetUrl = `${process.env.APP_URL || 'https://dash.galanteelemperador.com'}/splitsheets/generate/${trackId}`;
        
        const emailContent = `
            <h2>Splitsheet Agreement - ${track.title}</h2>
            <p><strong>Tema:</strong> ${track.title}</p>
            <p><strong>Artista:</strong> Galante el Emperador</p>
            <p><strong>Productor:</strong> ${track.producer_name}</p>
            <p><strong>División:</strong> ${track.split_percentage || '50/50'}</p>
            
            ${message ? `<p><strong>Mensaje:</strong><br>${message}</p>` : ''}
            
            <p>Ver splitsheet completo: <a href="${splitsheetUrl}">${splitsheetUrl}</a></p>
            
            <hr>
            <p style="font-size: 0.9em; color: #666;">Este es un email automático de El Inmortal 2 Dashboard.</p>
        `;
        
        // Send emails
        const emailPromises = [];
        
        // Email to producer
        emailPromises.push(transporter.sendMail({
            from: '"El Inmortal 2" <splits@galanteelemperador.com>',
            to: toProducer,
            subject: `Splitsheet - ${track.title}`,
            html: emailContent
        }));
        
        // Email to artist (CC)
        emailPromises.push(transporter.sendMail({
            from: '"El Inmortal 2" <splits@galanteelemperador.com>',
            to: toArtist,
            subject: `Copia: Splitsheet - ${track.title}`,
            html: emailContent
        }));
        
        await Promise.all(emailPromises);
        
        // Update splitsheet status
        await run(`
            UPDATE splitsheets 
            SET status = 'sent', sent_date = CURRENT_TIMESTAMP 
            WHERE track_id = ?
        `, [trackId]);
        
        res.json({ 
            success: true, 
            message: 'Emails enviados exitosamente' 
        });
        
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            error: 'Error enviando emails',
            details: error.message 
        });
    }
});

module.exports = router;
