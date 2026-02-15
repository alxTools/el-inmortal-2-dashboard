const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../config/database');

// GET all artists
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        
        const artists = await new Promise((resolve, reject) => {
            db.all(`
                SELECT a.*, COUNT(ta.id) as track_count
                FROM artists a
                LEFT JOIN track_artists ta ON a.id = ta.artist_id
                GROUP BY a.id
                ORDER BY a.name
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('artists/index', {
            title: 'Artistas - El Inmortal 2',
            artists: artists
        });
    } catch (error) {
        console.error('Error fetching artists:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando artistas',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET new artist form
router.get('/new', (req, res) => {
    res.render('artists/new', {
        title: 'Nuevo Artista - El Inmortal 2'
    });
});

// POST create artist
router.post('/', [
    body('name').trim().notEmpty(),
    body('email').optional().isEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('artists/new', {
            title: 'Nuevo Artista',
            errors: errors.array(),
            formData: req.body
        });
    }

    try {
        const db = getDatabase();
        const { 
            name, legal_name, email, phone, artist_type,
            record_label, management, social_media, notes 
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO artists (name, legal_name, email, phone, artist_type, record_label, management, social_media, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [name, legal_name, email, phone, artist_type || 'featured', record_label, management, social_media, notes], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

        res.redirect('/artists');
    } catch (error) {
        console.error('Error creating artist:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error creando artista',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET edit form
router.get('/:id/edit', async (req, res) => {
    try {
        const db = getDatabase();
        const artistId = req.params.id;

        const artist = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM artists WHERE id = ?', [artistId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!artist) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Artista no encontrado',
                error: {}
            });
        }

        res.render('artists/edit', {
            title: `Editar: ${artist.name}`,
            artist: artist
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

// PUT update artist
router.put('/:id', async (req, res) => {
    try {
        const db = getDatabase();
        const artistId = req.params.id;
        const { 
            name, legal_name, email, phone, artist_type,
            record_label, management, social_media, notes, status 
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE artists 
                SET name = ?, legal_name = ?, email = ?, phone = ?, artist_type = ?,
                    record_label = ?, management = ?, social_media = ?, notes = ?, status = ?
                WHERE id = ?
            `, [name, legal_name, email, phone, artist_type, record_label, management, social_media, notes, status, artistId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.redirect('/artists');
    } catch (error) {
        console.error('Error updating artist:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando artista',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// DELETE artist
router.delete('/:id', async (req, res) => {
    try {
        const db = getDatabase();
        const artistId = req.params.id;

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM artists WHERE id = ?', [artistId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Artista eliminado' });
    } catch (error) {
        console.error('Error deleting artist:', error);
        res.status(500).json({ success: false, message: 'Error eliminando artista' });
    }
});

module.exports = router;