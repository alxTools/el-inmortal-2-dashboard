const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

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

async function ensureSplitsheetWorkflowColumns() {
    const columns = await getAll(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'splitsheets'`
    );

    const existing = new Set(
        columns
            .map((row) => String(row.column_name || row.COLUMN_NAME || '').toLowerCase())
            .filter(Boolean)
    );

    const needed = [
        ['producer_confirmed_at', 'DATETIME NULL'],
        ['artist_confirmed_at', 'DATETIME NULL'],
        ['composer_confirmed_at', 'DATETIME NULL']
    ];

    for (const [columnName, definition] of needed) {
        if (existing.has(columnName.toLowerCase())) continue;
        try {
            await run(`ALTER TABLE splitsheets ADD COLUMN ${columnName} ${definition}`);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }
}

async function ensureSplitsheetInfra() {
    await ensureTrackCreditsTables();
    await ensureSplitsheetWorkflowColumns();
}

function formatDateTime(value) {
    if (!value) return 'Pendiente';
    const dateObj = new Date(value);
    if (Number.isNaN(dateObj.getTime())) return 'Pendiente';
    return dateObj.toLocaleString('es-PR');
}

function htmlEscape(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function getConfirmationState(rows) {
    const total = rows.length;
    const producerConfirmedCount = rows.filter((row) => row.producer_confirmed_at).length;
    const artistConfirmedCount = rows.filter((row) => row.artist_confirmed_at).length;
    const composerConfirmedCount = rows.filter((row) => row.composer_confirmed_at).length;

    const producerConfirmed = total > 0 && producerConfirmedCount === total;
    const artistConfirmed = total > 0 && artistConfirmedCount === total;
    const composerConfirmed = total > 0 && composerConfirmedCount === total;

    return {
        total,
        producerConfirmedCount,
        artistConfirmedCount,
        composerConfirmedCount,
        producerConfirmed,
        artistConfirmed,
        composerConfirmed,
        trackConfirmed: producerConfirmed && artistConfirmed && composerConfirmed
    };
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

async function getTrackComposers(trackId) {
    return await getAll(
        `SELECT c.id, c.name, c.email
         FROM track_composers tc
         JOIN composers c ON c.id = tc.composer_id
         WHERE tc.track_id = ?
         ORDER BY c.name`,
        [trackId]
    );
}

async function syncTrackSplitsheetFlags(trackId) {
    const summary = await getOne(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN producer_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS producer_confirmed,
            SUM(CASE WHEN artist_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS artist_confirmed,
            SUM(CASE WHEN composer_confirmed_at IS NOT NULL THEN 1 ELSE 0 END) AS composer_confirmed
         FROM splitsheets
         WHERE track_id = ?`,
        [trackId]
    );

    const total = Number(summary?.total || 0);
    const producerConfirmed = Number(summary?.producer_confirmed || 0);
    const artistConfirmed = Number(summary?.artist_confirmed || 0);
    const composerConfirmed = Number(summary?.composer_confirmed || 0);

    const splitsheetSent = total > 0 ? 1 : 0;
    const splitsheetConfirmed =
        total > 0 &&
        producerConfirmed === total &&
        artistConfirmed === total &&
        composerConfirmed === total
            ? 1
            : 0;

    if (splitsheetConfirmed) {
        await run(
            `UPDATE splitsheets
             SET status = 'confirmed',
                 confirmed_date = COALESCE(confirmed_date, NOW())
             WHERE track_id = ?`,
            [trackId]
        );
    } else {
        await run(
            `UPDATE splitsheets
             SET status = CASE
                 WHEN sent_date IS NOT NULL THEN 'sent'
                 ELSE 'pending'
             END
             WHERE track_id = ?
               AND status = 'confirmed'`,
            [trackId]
        );
    }

    await run(
        'UPDATE tracks SET splitsheet_sent = ?, splitsheet_confirmed = ? WHERE id = ?',
        [splitsheetSent, splitsheetConfirmed, trackId]
    );
}

// GET splitsheets dashboard
router.get('/', async (req, res) => {
    try {
        await ensureSplitsheetInfra();

        const splitsheets = await getAll(`
            SELECT
                s.*,
                t.title as track_title,
                t.track_number,
                p.name as producer_name,
                p.email as producer_email,
                CASE
                    WHEN s.producer_confirmed_at IS NOT NULL
                     AND s.artist_confirmed_at IS NOT NULL
                     AND s.composer_confirmed_at IS NOT NULL
                    THEN 1
                    ELSE 0
                END AS all_roles_confirmed
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

// GET professional PDF view for a splitsheet track package
router.get('/:id/pdf', async (req, res) => {
    try {
        await ensureSplitsheetInfra();

        const splitsheet = await getSplitsheetById(req.params.id);
        if (!splitsheet) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Splitsheet no encontrado',
                error: {}
            });
        }

        const track = await getOne('SELECT id, track_number, title FROM tracks WHERE id = ?', [splitsheet.track_id]);
        const producerSplits = await getSplitsheetsByTrackId(splitsheet.track_id);
        const composers = await getTrackComposers(splitsheet.track_id);
        const confirmationState = getConfirmationState(producerSplits);
        const artistPercentage = Number(producerSplits[0]?.artist_percentage || 50);

        const fileSafeTrack = String(track?.title || 'track')
            .replace(/[^a-zA-Z0-9-_]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase() || 'track';
        const filename = `splitsheet-${track?.track_number || 'x'}-${fileSafeTrack}.pdf`;

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

        const doc = new PDFDocument({ size: 'A4', margin: 48 });
        doc.pipe(res);

        doc.rect(40, 36, 515, 86).fill('#0f172a');
        doc.fillColor('#facc15').fontSize(11).text('EL INMORTAL 2 - RIGHTS MANAGEMENT', 56, 56);
        doc.fillColor('#ffffff').fontSize(24).text('SPLITSHEET AGREEMENT', 56, 74);

        let y = 146;
        doc.fillColor('#111827').fontSize(11);
        doc.text(`Tema: #${track?.track_number || '-'} - ${track?.title || 'Sin título'}`, 48, y);
        y += 18;
        doc.text('Artista: Galante el Emperador', 48, y);
        y += 18;
        doc.text(`Fecha de emisión: ${new Date().toLocaleDateString('es-PR')}`, 48, y);
        y += 24;

        doc.fillColor('#0f172a').fontSize(13).text('Participaciones', 48, y);
        y += 18;

        doc.fillColor('#111827').fontSize(11);
        doc.text(`Artista (Master + Publishing): ${artistPercentage}%`, 52, y);
        y += 18;

        producerSplits.forEach((row, index) => {
            if (y > 710) {
                doc.addPage();
                y = 56;
            }

            const producerStatus = row.producer_confirmed_at
                ? `Confirmado ${formatDateTime(row.producer_confirmed_at)}`
                : 'Pendiente de confirmación';

            doc.text(
                `${index + 1}. ${row.producer_name || 'Productor'} - ${row.producer_percentage}% (${producerStatus})`,
                52,
                y,
                { width: 500 }
            );
            y += 18;
        });

        y += 12;
        if (y > 700) {
            doc.addPage();
            y = 56;
        }

        doc.fillColor('#0f172a').fontSize(13).text('Compositores', 48, y);
        y += 18;
        doc.fillColor('#111827').fontSize(11);
        if (!composers.length) {
            doc.text('No hay compositores asignados.', 52, y);
            y += 18;
        } else {
            composers.forEach((composer, idx) => {
                if (y > 710) {
                    doc.addPage();
                    y = 56;
                }
                doc.text(`${idx + 1}. ${composer.name}${composer.email ? ` (${composer.email})` : ''}`, 52, y, { width: 500 });
                y += 18;
            });
        }

        y += 12;
        if (y > 700) {
            doc.addPage();
            y = 56;
        }

        doc.fillColor('#0f172a').fontSize(13).text('Estado de Confirmaciones', 48, y);
        y += 18;
        doc.fillColor('#111827').fontSize(11);
        doc.text(`Productores: ${confirmationState.producerConfirmed ? 'Confirmado' : 'Pendiente'}`, 52, y);
        y += 16;
        doc.text(`Compositores: ${confirmationState.composerConfirmed ? 'Confirmado' : 'Pendiente'}`, 52, y);
        y += 16;
        doc.text(`Artista: ${confirmationState.artistConfirmed ? 'Confirmado' : 'Pendiente'}`, 52, y);
        y += 16;
        doc.text(`Track final: ${confirmationState.trackConfirmed ? 'CONFIRMADO' : 'AUN PENDIENTE'}`, 52, y);

        y += 26;
        doc.fontSize(9).fillColor('#4b5563').text(
            'Documento generado automáticamente por El Inmortal 2 Dashboard. Esta versión resume participaciones y estado legal de aprobación.',
            48,
            y,
            { width: 500 }
        );

        doc.end();
    } catch (error) {
        console.error('Error generating splitsheet PDF:', error);
        return res.status(500).send('Error generando PDF del splitsheet');
    }
});

// POST confirm or unconfirm role (artist/composer/producer)
router.post('/:id/confirm-role', async (req, res) => {
    try {
        await ensureSplitsheetInfra();

        const splitsheet = await getSplitsheetById(req.params.id);
        if (!splitsheet) {
            return res.status(404).json({ error: 'Splitsheet no encontrado' });
        }

        const role = String(req.body.role || '').trim().toLowerCase();
        const roleColumns = {
            producer: 'producer_confirmed_at',
            artist: 'artist_confirmed_at',
            composer: 'composer_confirmed_at'
        };

        const columnName = roleColumns[role];
        if (!columnName) {
            return res.status(422).json({ error: 'Role inválido. Usa producer, artist o composer.' });
        }

        const confirmedRaw = String(req.body.confirmed ?? '1').trim().toLowerCase();
        const shouldConfirm = !['0', 'false', 'off', 'no'].includes(confirmedRaw);
        const producerId = toPositiveInt(req.body.producer_id);

        if (shouldConfirm) {
            if (role === 'producer' && producerId) {
                await run(
                    `UPDATE splitsheets
                     SET ${columnName} = COALESCE(${columnName}, NOW())
                     WHERE track_id = ? AND producer_id = ?`,
                    [splitsheet.track_id, producerId]
                );
            } else {
                await run(
                    `UPDATE splitsheets
                     SET ${columnName} = COALESCE(${columnName}, NOW())
                     WHERE track_id = ?`,
                    [splitsheet.track_id]
                );
            }
        } else {
            if (role === 'producer' && producerId) {
                await run(
                    `UPDATE splitsheets
                     SET ${columnName} = NULL
                     WHERE track_id = ? AND producer_id = ?`,
                    [splitsheet.track_id, producerId]
                );
            } else {
                await run(
                    `UPDATE splitsheets
                     SET ${columnName} = NULL
                     WHERE track_id = ?`,
                    [splitsheet.track_id]
                );
            }
        }

        await syncTrackSplitsheetFlags(splitsheet.track_id);

        const updatedRows = await getSplitsheetsByTrackId(splitsheet.track_id);
        const confirmationState = getConfirmationState(updatedRows);

        return res.json({
            success: true,
            message: shouldConfirm ? 'Confirmación actualizada' : 'Confirmación removida',
            confirmationState
        });
    } catch (error) {
        console.error('Error updating role confirmation:', error);
        return res.status(500).json({
            error: 'Error actualizando confirmación',
            details: error.message
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

        await ensureSplitsheetInfra();

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
        const confirmationState = getConfirmationState(producerSplits);
        const flash = String(req.query.flash || '').trim();

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
            confirmationState,
            flash,
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

        await ensureSplitsheetInfra();

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

        const currentRows = await getSplitsheetsByTrackId(existing.track_id);
        const producerConfirmationMap = new Map(
            currentRows.map((row) => [Number(row.producer_id), row.producer_confirmed_at || null])
        );
        const existingArtistConfirmedAt = currentRows.find((row) => row.artist_confirmed_at)?.artist_confirmed_at || null;
        const existingComposerConfirmedAt = currentRows.find((row) => row.composer_confirmed_at)?.composer_confirmed_at || null;
        const existingSentDate = currentRows.find((row) => row.sent_date)?.sent_date || null;
        const existingConfirmedDate = currentRows.find((row) => row.confirmed_date)?.confirmed_date || null;

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
                confirmationState: getConfirmationState(producerSplitsForView),
                flash: '',
                validationError
            });
        }

        const sentDate = (status === 'sent' || status === 'confirmed')
            ? (existingSentDate || new Date())
            : null;
        const confirmedDate = status === 'confirmed'
            ? (existingConfirmedDate || new Date())
            : null;

        await run('DELETE FROM splitsheets WHERE track_id = ?', [existing.track_id]);
        for (const row of producerEntries) {
            const producerConfirmedAt = producerConfirmationMap.get(Number(row.producerId)) || null;
            await run(
                `INSERT INTO splitsheets
                 (track_id, producer_id, artist_percentage, producer_percentage, status, notes, sent_date, confirmed_date,
                  producer_confirmed_at, artist_confirmed_at, composer_confirmed_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    existing.track_id,
                    row.producerId,
                    artistPercentage,
                    row.producerPercentage,
                    status,
                    notes || null,
                    sentDate,
                    confirmedDate,
                    producerConfirmedAt,
                    existingArtistConfirmedAt,
                    existingComposerConfirmedAt
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
        await ensureSplitsheetInfra();

        const trackId = req.params.trackId;
        const { producerEmail, artistEmail, message } = req.body;

        const track = await getOne(
            'SELECT id, title, track_number FROM tracks WHERE id = ?',
            [trackId]
        );

        if (!track) {
            return res.status(404).json({ error: 'Track no encontrado' });
        }

        const producerSplits = await getSplitsheetsByTrackId(trackId);
        if (!producerSplits.length) {
            return res.status(422).json({ error: 'No hay splitsheets para este track' });
        }

        const composers = await getTrackComposers(trackId);

        const explicitProducerEmail = String(producerEmail || '').trim();
        const producerRecipients = explicitProducerEmail
            ? [explicitProducerEmail]
            : [...new Set(
                producerSplits
                    .map((row) => String(row.producer_email || '').trim())
                    .filter(Boolean)
            )];

        if (!producerRecipients.length) {
            return res.status(400).json({ error: 'No hay emails de productores para enviar' });
        }

        const toArtist = String(artistEmail || process.env.SPLITSHEET_ARTIST_EMAIL || 'galante@el-emperador.com').trim();
        const appUrl = String(process.env.APP_URL || process.env.BASE_URL || 'https://ei2.galantealx.com').trim().replace(/\/$/, '');
        const representativeSplitsheetId = producerSplits[0].id;
        const splitsheetPdfUrl = `${appUrl}/splitsheets/${representativeSplitsheetId}/pdf`;
        const splitsheetEditUrl = `${appUrl}/splitsheets/${representativeSplitsheetId}/edit`;

        const producerBreakdownHtml = producerSplits
            .map((row) => `<li><strong>${htmlEscape(row.producer_name)}</strong>: ${row.producer_percentage}%</li>`)
            .join('');
        const composerBreakdownHtml = composers.length
            ? composers.map((row) => `<li>${htmlEscape(row.name)}</li>`).join('')
            : '<li>No hay compositores asignados</li>';

        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const emailContent = `
            <h2>Splitsheet Agreement - ${htmlEscape(track.title)}</h2>
            <p><strong>Tema:</strong> #${track.track_number || '-'} - ${htmlEscape(track.title)}</p>
            <p><strong>Artista:</strong> Galante el Emperador</p>

            <h3>División de Productores</h3>
            <ul>${producerBreakdownHtml}</ul>

            <h3>Compositores</h3>
            <ul>${composerBreakdownHtml}</ul>

            ${message ? `<p><strong>Mensaje:</strong><br>${htmlEscape(message)}</p>` : ''}

            <p><strong>Ver versión PDF:</strong> <a href="${splitsheetPdfUrl}">${splitsheetPdfUrl}</a></p>
            <p><strong>Ver/Editar en dashboard:</strong> <a href="${splitsheetEditUrl}">${splitsheetEditUrl}</a></p>

            <hr>
            <p style="font-size: 0.9em; color: #666;">Este es un email automático de El Inmortal 2 Dashboard.</p>
        `;

        const emailPromises = [];

        for (const recipient of producerRecipients) {
            emailPromises.push(
                transporter.sendMail({
                    from: '"El Inmortal 2" <splits@galanteelemperador.com>',
                    to: recipient,
                    subject: `Splitsheet - ${track.title}`,
                    html: emailContent
                })
            );
        }

        if (toArtist) {
            emailPromises.push(
                transporter.sendMail({
                    from: '"El Inmortal 2" <splits@galanteelemperador.com>',
                    to: toArtist,
                    subject: `Copia: Splitsheet - ${track.title}`,
                    html: emailContent
                })
            );
        }

        await Promise.all(emailPromises);

        await run(`
            UPDATE splitsheets 
            SET status = CASE WHEN status = 'pending' THEN 'sent' ELSE status END,
                sent_date = COALESCE(sent_date, CURRENT_TIMESTAMP)
            WHERE track_id = ?
        `, [trackId]);

        await syncTrackSplitsheetFlags(trackId);
        
        res.json({ 
            success: true, 
            message: `Emails enviados exitosamente a ${producerRecipients.length} productor(es)`
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
