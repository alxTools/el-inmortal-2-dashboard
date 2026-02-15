const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../config/database');

// GET all tracks
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        const filter = req.query.filter;
        
        let query = `
            SELECT t.*, p.name as producer_name, p.email as producer_email
            FROM tracks t
            LEFT JOIN producers p ON t.producer_id = p.id
        `;
        
        // Apply filters
        if (filter === 'singles') {
            query += ' WHERE t.is_single = 1';
        } else if (filter === 'primary') {
            query += ' WHERE t.is_primary = 1';
        } else if (filter === 'album') {
            query += ' WHERE t.is_single = 0 AND t.is_primary = 0';
        } else if (filter === 'pending') {
            query += ' WHERE t.splitsheet_confirmed = 0';
        }
        
        query += ' ORDER BY t.track_number';
        
        const tracks = await new Promise((resolve, reject) => {
            db.all(query, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('tracks/index', {
            title: 'Lista de Temas - El Inmortal 2',
            tracks: tracks,
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
        const db = getDatabase();
        
        const producers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM producers ORDER BY name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('tracks/new', {
            title: 'Nuevo Tema - El Inmortal 2',
            producers: producers
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
router.post('/', [
    body('track_number').isInt({ min: 1, max: 21 }),
    body('title').trim().notEmpty(),
    body('producer_id').optional().isInt()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('tracks/new', {
            title: 'Nuevo Tema',
            errors: errors.array(),
            formData: req.body
        });
    }

    try {
        const db = getDatabase();
        const { track_number, title, producer_id, recording_date, duration, lyrics } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO tracks (track_number, title, producer_id, recording_date, duration, lyrics)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [track_number, title, producer_id || null, recording_date, duration, lyrics], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

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

// GET edit track form
router.get('/:id/edit', async (req, res) => {
    try {
        const db = getDatabase();
        const trackId = req.params.id;

        const track = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM tracks WHERE id = ?', [trackId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }

        const producers = await new Promise((resolve, reject) => {
            db.all('SELECT * FROM producers ORDER BY name', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('tracks/edit', {
            title: `Editar: ${track.title}`,
            track: track,
            producers: producers
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
        const db = getDatabase();
        const trackId = req.params.id;
        const { title, producer_id, recording_date, duration, lyrics, status, is_single, is_primary, track_type } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE tracks 
                SET title = ?, producer_id = ?, recording_date = ?, 
                    duration = ?, lyrics = ?, status = ?, 
                    is_single = ?, is_primary = ?, track_type = ?,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [
                title, 
                producer_id || null, 
                recording_date, 
                duration, 
                lyrics, 
                status, 
                is_single ? 1 : 0, 
                is_primary ? 1 : 0, 
                track_type || 'album', 
                trackId
            ], (err) => {
                if (err) reject(err);
                else resolve();
            });
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

// DELETE track
router.delete('/:id', async (req, res) => {
    try {
        const db = getDatabase();
        const trackId = req.params.id;

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM tracks WHERE id = ?', [trackId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Tema eliminado' });
    } catch (error) {
        console.error('Error deleting track:', error);
        res.status(500).json({ success: false, message: 'Error eliminando tema' });
    }
});

module.exports = router;