const express = require('express');
const crypto = require('crypto');
const { getAll, getOne, run } = require('../config/database');
const { apiKeyAuth, hashApiKey, ensureApiKeysTable } = require('../middleware/apiKeyAuth');

const router = express.Router();

function ok(res, data = {}, status = 200) {
    return res.status(status).json({ success: true, data });
}

function fail(res, code, message, status = 400, details) {
    return res.status(status).json({
        success: false,
        error: {
            code,
            message,
            details: details || null
        }
    });
}

function parseBool(value) {
    if (value === true || value === 1 || value === '1' || value === 'true' || value === 'on') return 1;
    if (value === false || value === 0 || value === '0' || value === 'false' || value === 'off') return 0;
    return 0;
}

function requireMaster(req, res, next) {
    if (!req.apiClient || !req.apiClient.isMaster) {
        return fail(res, 'FORBIDDEN', 'Master API key required', 403);
    }
    next();
}

router.get('/health', (req, res) => {
    return ok(res, { service: 'el-inmortal-2-api-v1', status: 'ok', timestamp: new Date().toISOString() });
});

router.use(apiKeyAuth);

router.get('/me', (req, res) => {
    return ok(res, { apiClient: req.apiClient });
});

router.post('/keys', requireMaster, async (req, res) => {
    try {
        await ensureApiKeysTable();

        const { name, company_id, scopes } = req.body;
        if (!name) return fail(res, 'VALIDATION_ERROR', 'name is required', 422);

        const plainKey = `mcp_${crypto.randomBytes(24).toString('hex')}`;
        const keyHash = hashApiKey(plainKey);

        const result = await run(
            `INSERT INTO api_keys (company_id, name, key_hash, scopes, status)
             VALUES (?, ?, ?, ?, 'active')`,
            [company_id || null, name, keyHash, Array.isArray(scopes) ? scopes.join(',') : (scopes || null)]
        );

        return ok(res, {
            id: result.lastID || result.insertId,
            name,
            company_id: company_id || null,
            api_key: plainKey,
            note: 'Store this key securely. It is shown only once.'
        }, 201);
    } catch (error) {
        console.error('Create API key error:', error);
        return fail(res, 'CREATE_API_KEY_ERROR', 'Could not create API key', 500, error.message);
    }
});

router.get('/stats', async (req, res) => {
    try {
        const tracks = await getOne('SELECT COUNT(*) AS total FROM tracks');
        const albums = await getOne('SELECT COUNT(*) AS total FROM album_info');
        const producers = await getOne('SELECT COUNT(*) AS total FROM producers');
        const splitsheets = await getOne(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent FROM splitsheets`);

        return ok(res, {
            tracks: tracks?.total || 0,
            albums: albums?.total || 0,
            producers: producers?.total || 0,
            splitsheets: {
                total: splitsheets?.total || 0,
                sent: splitsheets?.sent || 0
            }
        });
    } catch (error) {
        return fail(res, 'STATS_ERROR', 'Could not load stats', 500, error.message);
    }
});

router.get('/albums', async (req, res) => {
    try {
        const rows = await getAll(`
            SELECT a.*, COUNT(t.id) AS track_count
            FROM album_info a
            LEFT JOIN tracks t ON t.album_id = a.id
            GROUP BY a.id
            ORDER BY a.created_at DESC
        `);
        return ok(res, rows);
    } catch (error) {
        return fail(res, 'ALBUM_LIST_ERROR', 'Could not list albums', 500, error.message);
    }
});

router.get('/albums/:id', async (req, res) => {
    try {
        const album = await getOne('SELECT * FROM album_info WHERE id = ?', [req.params.id]);
        if (!album) return fail(res, 'NOT_FOUND', 'Album not found', 404);

        const tracks = await getAll('SELECT * FROM tracks WHERE album_id = ? ORDER BY track_number', [req.params.id]);
        return ok(res, { ...album, tracks });
    } catch (error) {
        return fail(res, 'ALBUM_GET_ERROR', 'Could not get album', 500, error.message);
    }
});

router.post('/albums', async (req, res) => {
    try {
        const { name, artist, release_date, status, description, cover_image_path } = req.body;
        if (!name || !artist) return fail(res, 'VALIDATION_ERROR', 'name and artist are required', 422);

        const result = await run(
            `INSERT INTO album_info (name, artist, release_date, status, description, cover_image_path)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, artist, release_date || null, status || 'upcoming', description || null, cover_image_path || null]
        );

        const created = await getOne('SELECT * FROM album_info WHERE id = ?', [result.lastID || result.insertId]);
        return ok(res, created, 201);
    } catch (error) {
        return fail(res, 'ALBUM_CREATE_ERROR', 'Could not create album', 500, error.message);
    }
});

router.put('/albums/:id', async (req, res) => {
    try {
        const { name, artist, release_date, status, description, cover_image_path } = req.body;
        await run(
            `UPDATE album_info
             SET name = ?, artist = ?, release_date = ?, status = ?, description = ?, cover_image_path = ?
             WHERE id = ?`,
            [name, artist, release_date || null, status || 'upcoming', description || null, cover_image_path || null, req.params.id]
        );
        const updated = await getOne('SELECT * FROM album_info WHERE id = ?', [req.params.id]);
        if (!updated) return fail(res, 'NOT_FOUND', 'Album not found', 404);
        return ok(res, updated);
    } catch (error) {
        return fail(res, 'ALBUM_UPDATE_ERROR', 'Could not update album', 500, error.message);
    }
});

router.delete('/albums/:id', async (req, res) => {
    try {
        const count = await getOne('SELECT COUNT(*) AS c FROM tracks WHERE album_id = ?', [req.params.id]);
        if ((count?.c || 0) > 0) {
            return fail(res, 'ALBUM_HAS_TRACKS', 'Album has associated tracks', 409, { trackCount: count.c });
        }
        await run('DELETE FROM album_info WHERE id = ?', [req.params.id]);
        return ok(res, { deleted: true });
    } catch (error) {
        return fail(res, 'ALBUM_DELETE_ERROR', 'Could not delete album', 500, error.message);
    }
});

router.get('/tracks', async (req, res) => {
    try {
        const { filter } = req.query;
        let sql = `
            SELECT t.*, p.name AS producer_name, p.email AS producer_email
            FROM tracks t
            LEFT JOIN producers p ON p.id = t.producer_id
        `;
        if (filter === 'singles') sql += ' WHERE t.is_single = 1';
        if (filter === 'primary') sql += ' WHERE t.is_primary = 1';
        if (filter === 'album') sql += ' WHERE t.is_single = 0 AND t.is_primary = 0';
        if (filter === 'pending') sql += ' WHERE t.splitsheet_confirmed = 0';
        sql += ' ORDER BY t.track_number';
        const rows = await getAll(sql);
        return ok(res, rows);
    } catch (error) {
        return fail(res, 'TRACK_LIST_ERROR', 'Could not list tracks', 500, error.message);
    }
});

router.get('/tracks/:id', async (req, res) => {
    try {
        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [req.params.id]);
        if (!track) return fail(res, 'NOT_FOUND', 'Track not found', 404);
        return ok(res, track);
    } catch (error) {
        return fail(res, 'TRACK_GET_ERROR', 'Could not get track', 500, error.message);
    }
});

router.post('/tracks', async (req, res) => {
    try {
        const {
            track_number,
            title,
            album_id,
            producer_id,
            recording_date,
            duration,
            lyrics,
            status,
            track_type,
            is_single,
            is_primary,
            features,
            cover_image_path
        } = req.body;

        if (!track_number || !title) return fail(res, 'VALIDATION_ERROR', 'track_number and title are required', 422);

        const result = await run(
            `INSERT INTO tracks
             (track_number, title, album_id, producer_id, recording_date, duration, lyrics, status, track_type, is_single, is_primary, features, cover_image_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                track_number,
                title,
                album_id || null,
                producer_id || null,
                recording_date || null,
                duration || null,
                lyrics || null,
                status || 'pending',
                track_type || 'album',
                parseBool(is_single),
                parseBool(is_primary),
                features || null,
                cover_image_path || null
            ]
        );

        const created = await getOne('SELECT * FROM tracks WHERE id = ?', [result.lastID || result.insertId]);
        return ok(res, created, 201);
    } catch (error) {
        return fail(res, 'TRACK_CREATE_ERROR', 'Could not create track', 500, error.message);
    }
});

router.put('/tracks/:id', async (req, res) => {
    try {
        const {
            track_number,
            title,
            album_id,
            producer_id,
            recording_date,
            duration,
            lyrics,
            status,
            track_type,
            is_single,
            is_primary,
            features,
            cover_image_path,
            splitsheet_sent,
            splitsheet_confirmed,
            content_count
        } = req.body;

        await run(
            `UPDATE tracks
             SET track_number = ?, title = ?, album_id = ?, producer_id = ?,
                 recording_date = ?, duration = ?, lyrics = ?, status = ?,
                 track_type = ?, is_single = ?, is_primary = ?, features = ?,
                 cover_image_path = ?, splitsheet_sent = ?, splitsheet_confirmed = ?, content_count = ?
             WHERE id = ?`,
            [
                track_number,
                title,
                album_id || null,
                producer_id || null,
                recording_date || null,
                duration || null,
                lyrics || null,
                status || 'pending',
                track_type || 'album',
                parseBool(is_single),
                parseBool(is_primary),
                features || null,
                cover_image_path || null,
                parseBool(splitsheet_sent),
                parseBool(splitsheet_confirmed),
                content_count || 0,
                req.params.id
            ]
        );

        const updated = await getOne('SELECT * FROM tracks WHERE id = ?', [req.params.id]);
        if (!updated) return fail(res, 'NOT_FOUND', 'Track not found', 404);
        return ok(res, updated);
    } catch (error) {
        return fail(res, 'TRACK_UPDATE_ERROR', 'Could not update track', 500, error.message);
    }
});

router.delete('/tracks/:id', async (req, res) => {
    try {
        await run('DELETE FROM tracks WHERE id = ?', [req.params.id]);
        return ok(res, { deleted: true });
    } catch (error) {
        return fail(res, 'TRACK_DELETE_ERROR', 'Could not delete track', 500, error.message);
    }
});

async function listSimple(table, res) {
    const rows = await getAll(`SELECT * FROM ${table} ORDER BY id DESC`);
    return ok(res, rows);
}

async function getSimple(table, id, res, label) {
    const row = await getOne(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!row) return fail(res, 'NOT_FOUND', `${label} not found`, 404);
    return ok(res, row);
}

router.get('/producers', async (req, res) => {
    try { return await listSimple('producers', res); } catch (error) { return fail(res, 'PRODUCER_LIST_ERROR', 'Could not list producers', 500, error.message); }
});
router.get('/producers/:id', async (req, res) => {
    try { return await getSimple('producers', req.params.id, res, 'Producer'); } catch (error) { return fail(res, 'PRODUCER_GET_ERROR', 'Could not get producer', 500, error.message); }
});
router.post('/producers', async (req, res) => {
    try {
        const { name, legal_name, email, phone, address, split_percentage, status, avatar_path } = req.body;
        if (!name || !email) return fail(res, 'VALIDATION_ERROR', 'name and email are required', 422);
        const result = await run(
            `INSERT INTO producers (name, legal_name, email, phone, address, split_percentage, status, avatar_path)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [name, legal_name || null, email, phone || null, address || null, split_percentage || '50/50', status || 'active', avatar_path || null]
        );
        return ok(res, await getOne('SELECT * FROM producers WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'PRODUCER_CREATE_ERROR', 'Could not create producer', 500, error.message); }
});
router.put('/producers/:id', async (req, res) => {
    try {
        const { name, legal_name, email, phone, address, split_percentage, status, avatar_path } = req.body;
        await run(
            `UPDATE producers SET name = ?, legal_name = ?, email = ?, phone = ?, address = ?, split_percentage = ?, status = ?, avatar_path = ? WHERE id = ?`,
            [name, legal_name || null, email, phone || null, address || null, split_percentage || '50/50', status || 'active', avatar_path || null, req.params.id]
        );
        return ok(res, await getOne('SELECT * FROM producers WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'PRODUCER_UPDATE_ERROR', 'Could not update producer', 500, error.message); }
});
router.delete('/producers/:id', async (req, res) => {
    try { await run('DELETE FROM producers WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'PRODUCER_DELETE_ERROR', 'Could not delete producer', 500, error.message); }
});

router.get('/composers', async (req, res) => {
    try { return await listSimple('composers', res); } catch (error) { return fail(res, 'COMPOSER_LIST_ERROR', 'Could not list composers', 500, error.message); }
});
router.get('/composers/:id', async (req, res) => {
    try { return await getSimple('composers', req.params.id, res, 'Composer'); } catch (error) { return fail(res, 'COMPOSER_GET_ERROR', 'Could not get composer', 500, error.message); }
});
router.post('/composers', async (req, res) => {
    try {
        const { name, email, phone, avatar_path } = req.body;
        if (!name) return fail(res, 'VALIDATION_ERROR', 'name is required', 422);
        const result = await run('INSERT INTO composers (name, email, phone, avatar_path) VALUES (?, ?, ?, ?)', [name, email || null, phone || null, avatar_path || null]);
        return ok(res, await getOne('SELECT * FROM composers WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'COMPOSER_CREATE_ERROR', 'Could not create composer', 500, error.message); }
});
router.put('/composers/:id', async (req, res) => {
    try {
        const { name, email, phone, avatar_path } = req.body;
        await run('UPDATE composers SET name = ?, email = ?, phone = ?, avatar_path = ? WHERE id = ?', [name, email || null, phone || null, avatar_path || null, req.params.id]);
        return ok(res, await getOne('SELECT * FROM composers WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'COMPOSER_UPDATE_ERROR', 'Could not update composer', 500, error.message); }
});
router.delete('/composers/:id', async (req, res) => {
    try { await run('DELETE FROM composers WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'COMPOSER_DELETE_ERROR', 'Could not delete composer', 500, error.message); }
});

router.get('/artists', async (req, res) => {
    try { return await listSimple('artists', res); } catch (error) { return fail(res, 'ARTIST_LIST_ERROR', 'Could not list artists', 500, error.message); }
});
router.get('/artists/:id', async (req, res) => {
    try { return await getSimple('artists', req.params.id, res, 'Artist'); } catch (error) { return fail(res, 'ARTIST_GET_ERROR', 'Could not get artist', 500, error.message); }
});
router.post('/artists', async (req, res) => {
    try {
        const { name, email, phone, avatar_path } = req.body;
        if (!name) return fail(res, 'VALIDATION_ERROR', 'name is required', 422);
        const result = await run('INSERT INTO artists (name, email, phone, avatar_path) VALUES (?, ?, ?, ?)', [name, email || null, phone || null, avatar_path || null]);
        return ok(res, await getOne('SELECT * FROM artists WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'ARTIST_CREATE_ERROR', 'Could not create artist', 500, error.message); }
});
router.put('/artists/:id', async (req, res) => {
    try {
        const { name, email, phone, avatar_path } = req.body;
        await run('UPDATE artists SET name = ?, email = ?, phone = ?, avatar_path = ? WHERE id = ?', [name, email || null, phone || null, avatar_path || null, req.params.id]);
        return ok(res, await getOne('SELECT * FROM artists WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'ARTIST_UPDATE_ERROR', 'Could not update artist', 500, error.message); }
});
router.delete('/artists/:id', async (req, res) => {
    try { await run('DELETE FROM artists WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'ARTIST_DELETE_ERROR', 'Could not delete artist', 500, error.message); }
});

router.get('/splitsheets', async (req, res) => {
    try {
        const rows = await getAll(`
            SELECT s.*, t.title AS track_title, p.name AS producer_name
            FROM splitsheets s
            LEFT JOIN tracks t ON t.id = s.track_id
            LEFT JOIN producers p ON p.id = s.producer_id
            ORDER BY s.created_at DESC
        `);
        return ok(res, rows);
    } catch (error) { return fail(res, 'SPLITSHEET_LIST_ERROR', 'Could not list splitsheets', 500, error.message); }
});
router.get('/splitsheets/:id', async (req, res) => {
    try { return await getSimple('splitsheets', req.params.id, res, 'Splitsheet'); } catch (error) { return fail(res, 'SPLITSHEET_GET_ERROR', 'Could not get splitsheet', 500, error.message); }
});
router.post('/splitsheets', async (req, res) => {
    try {
        const { track_id, producer_id, artist_percentage, producer_percentage, status, notes } = req.body;
        if (!track_id || !producer_id) return fail(res, 'VALIDATION_ERROR', 'track_id and producer_id are required', 422);
        const result = await run(
            `INSERT INTO splitsheets (track_id, producer_id, artist_percentage, producer_percentage, status, notes)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [track_id, producer_id, artist_percentage || 50, producer_percentage || 50, status || 'pending', notes || null]
        );
        return ok(res, await getOne('SELECT * FROM splitsheets WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'SPLITSHEET_CREATE_ERROR', 'Could not create splitsheet', 500, error.message); }
});
router.put('/splitsheets/:id', async (req, res) => {
    try {
        const { artist_percentage, producer_percentage, status, notes, sent_date, confirmed_date } = req.body;
        await run(
            `UPDATE splitsheets
             SET artist_percentage = ?, producer_percentage = ?, status = ?, notes = ?, sent_date = ?, confirmed_date = ?
             WHERE id = ?`,
            [artist_percentage || 50, producer_percentage || 50, status || 'pending', notes || null, sent_date || null, confirmed_date || null, req.params.id]
        );
        return ok(res, await getOne('SELECT * FROM splitsheets WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'SPLITSHEET_UPDATE_ERROR', 'Could not update splitsheet', 500, error.message); }
});
router.delete('/splitsheets/:id', async (req, res) => {
    try { await run('DELETE FROM splitsheets WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'SPLITSHEET_DELETE_ERROR', 'Could not delete splitsheet', 500, error.message); }
});

router.get('/calendar', async (req, res) => {
    try { return ok(res, await getAll('SELECT * FROM content_calendar ORDER BY date ASC, day_number ASC')); } catch (error) { return fail(res, 'CALENDAR_LIST_ERROR', 'Could not list calendar items', 500, error.message); }
});
router.post('/calendar', async (req, res) => {
    try {
        const { day_number, date, title, content_type, platform, description, status, completed, track_id } = req.body;
        if (!day_number || !date || !title || !content_type || !platform) return fail(res, 'VALIDATION_ERROR', 'day_number, date, title, content_type, platform are required', 422);
        const result = await run(
            `INSERT INTO content_calendar (day_number, date, title, content_type, platform, description, status, completed, track_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [day_number, date, title, content_type, platform, description || null, status || 'pending', parseBool(completed), track_id || null]
        );
        return ok(res, await getOne('SELECT * FROM content_calendar WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'CALENDAR_CREATE_ERROR', 'Could not create calendar item', 500, error.message); }
});
router.put('/calendar/:id', async (req, res) => {
    try {
        const { day_number, date, title, content_type, platform, description, status, completed, track_id } = req.body;
        await run(
            `UPDATE content_calendar
             SET day_number = ?, date = ?, title = ?, content_type = ?, platform = ?, description = ?, status = ?, completed = ?, track_id = ?
             WHERE id = ?`,
            [day_number, date, title, content_type, platform, description || null, status || 'pending', parseBool(completed), track_id || null, req.params.id]
        );
        return ok(res, await getOne('SELECT * FROM content_calendar WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'CALENDAR_UPDATE_ERROR', 'Could not update calendar item', 500, error.message); }
});
router.delete('/calendar/:id', async (req, res) => {
    try { await run('DELETE FROM content_calendar WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'CALENDAR_DELETE_ERROR', 'Could not delete calendar item', 500, error.message); }
});

router.get('/checklist', async (req, res) => {
    try { return ok(res, await getAll('SELECT * FROM checklist_items ORDER BY created_at DESC')); } catch (error) { return fail(res, 'CHECKLIST_LIST_ERROR', 'Could not list checklist items', 500, error.message); }
});
router.post('/checklist', async (req, res) => {
    try {
        const { category, item_text, priority, completed, notes } = req.body;
        if (!category || !item_text) return fail(res, 'VALIDATION_ERROR', 'category and item_text are required', 422);
        const result = await run(
            `INSERT INTO checklist_items (category, item_text, priority, completed, notes, completed_at)
             VALUES (?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN NOW() ELSE NULL END)`,
            [category, item_text, priority || 'normal', parseBool(completed), notes || null, parseBool(completed)]
        );
        return ok(res, await getOne('SELECT * FROM checklist_items WHERE id = ?', [result.lastID || result.insertId]), 201);
    } catch (error) { return fail(res, 'CHECKLIST_CREATE_ERROR', 'Could not create checklist item', 500, error.message); }
});
router.put('/checklist/:id', async (req, res) => {
    try {
        const { category, item_text, priority, completed, notes } = req.body;
        await run(
            `UPDATE checklist_items
             SET category = ?, item_text = ?, priority = ?, completed = ?, notes = ?,
                 completed_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END
             WHERE id = ?`,
            [category, item_text, priority || 'normal', parseBool(completed), notes || null, parseBool(completed), req.params.id]
        );
        return ok(res, await getOne('SELECT * FROM checklist_items WHERE id = ?', [req.params.id]));
    } catch (error) { return fail(res, 'CHECKLIST_UPDATE_ERROR', 'Could not update checklist item', 500, error.message); }
});
router.post('/checklist/:id/toggle', async (req, res) => {
    try {
        const row = await getOne('SELECT completed FROM checklist_items WHERE id = ?', [req.params.id]);
        if (!row) return fail(res, 'NOT_FOUND', 'Checklist item not found', 404);
        const next = row.completed === 1 ? 0 : 1;
        await run('UPDATE checklist_items SET completed = ?, completed_at = CASE WHEN ? = 1 THEN NOW() ELSE NULL END WHERE id = ?', [next, next, req.params.id]);
        return ok(res, { id: req.params.id, completed: next === 1 });
    } catch (error) { return fail(res, 'CHECKLIST_TOGGLE_ERROR', 'Could not toggle checklist item', 500, error.message); }
});
router.delete('/checklist/:id', async (req, res) => {
    try { await run('DELETE FROM checklist_items WHERE id = ?', [req.params.id]); return ok(res, { deleted: true }); } catch (error) { return fail(res, 'CHECKLIST_DELETE_ERROR', 'Could not delete checklist item', 500, error.message); }
});

module.exports = router;
