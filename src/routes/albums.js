const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');

// GET all albums
router.get('/', async (req, res) => {
    try {
        const albums = await getAll(`
            SELECT 
                a.*, 
                COUNT(t.id) AS track_count,
                SUM(CASE WHEN t.splitsheet_confirmed = 1 THEN 1 ELSE 0 END) AS confirmed_tracks
            FROM album_info a
            LEFT JOIN tracks t ON t.album_id = a.id
            GROUP BY a.id
            ORDER BY a.created_at DESC
        `);

        const albumStats = {
            total: albums.length,
            released: albums.filter((a) => a.status === 'released').length,
            draft: albums.filter((a) => a.status === 'draft').length,
            upcoming: albums.filter((a) => !a.status || a.status === 'upcoming').length,
            maxTracks: Math.max(1, ...albums.map((a) => Number(a.track_count || 0)))
        };

        res.render('albums/index', { 
            title: 'Álbumes',
            albums: albums,
            albumStats: albumStats
        });
    } catch (error) {
        console.error('Error fetching albums:', error);
        res.status(500).render('error', { error: 'Error cargando álbumes' });
    }
});

// GET new album form
router.get('/new', (req, res) => {
    res.render('albums/new', { 
        title: 'Nuevo Álbum'
    });
});

// POST create album
router.post('/', async (req, res) => {
    try {
        const { name, artist, release_date, status, description } = req.body;
        
        if (!name || !artist) {
            return res.status(400).json({ error: 'Nombre y artista son requeridos' });
        }
        
        const result = await run(
            `INSERT INTO album_info (name, artist, release_date, status, description) 
             VALUES (?, ?, ?, ?, ?)`,
            [name, artist, release_date || null, status || 'upcoming', description || null]
        );
        
        res.json({ 
            success: true, 
            message: 'Álbum creado exitosamente',
            albumId: result.lastID || result.insertId
        });
    } catch (error) {
        console.error('Error creating album:', error);
        res.status(500).json({ error: 'Error creando álbum' });
    }
});

// GET edit album form
router.get('/:id/edit', async (req, res) => {
    try {
        const albumId = req.params.id;
        const album = await getOne('SELECT * FROM album_info WHERE id = ?', [albumId]);
        
        if (!album) {
            return res.status(404).render('error', { error: 'Álbum no encontrado' });
        }
        
        res.render('albums/edit', { 
            title: 'Editar Álbum',
            album: album
        });
    } catch (error) {
        console.error('Error fetching album:', error);
        res.status(500).render('error', { error: 'Error cargando álbum' });
    }
});

// PUT update album
router.put('/:id', async (req, res) => {
    try {
        const albumId = req.params.id;
        const { name, artist, release_date, status, description } = req.body;
        
        if (!name || !artist) {
            return res.status(400).json({ error: 'Nombre y artista son requeridos' });
        }
        
        await run(
            `UPDATE album_info 
             SET name = ?, artist = ?, release_date = ?, status = ?, description = ?
             WHERE id = ?`,
            [name, artist, release_date || null, status || 'upcoming', description || null, albumId]
        );
        
        res.json({ 
            success: true, 
            message: 'Álbum actualizado exitosamente'
        });
    } catch (error) {
        console.error('Error updating album:', error);
        res.status(500).json({ error: 'Error actualizando álbum' });
    }
});

// DELETE album
router.delete('/:id', async (req, res) => {
    try {
        const albumId = req.params.id;
        
        // Check if album has tracks
        const tracks = await getAll('SELECT id FROM tracks WHERE album_id = ?', [albumId]);
        
        if (tracks.length > 0) {
            return res.status(400).json({ 
                error: 'No se puede eliminar el álbum porque tiene temas asociados',
                trackCount: tracks.length
            });
        }
        
        await run('DELETE FROM album_info WHERE id = ?', [albumId]);
        
        res.json({ 
            success: true, 
            message: 'Álbum eliminado exitosamente'
        });
    } catch (error) {
        console.error('Error deleting album:', error);
        res.status(500).json({ error: 'Error eliminando álbum' });
    }
});

// GET album details with tracks
router.get('/:id', async (req, res) => {
    try {
        const albumId = req.params.id;
        
        const album = await getOne('SELECT * FROM album_info WHERE id = ?', [albumId]);
        
        if (!album) {
            return res.status(404).render('error', { title: 'Error', error: 'Álbum no encontrado' });
        }
        
        const tracks = await getAll('SELECT id, track_number, title, audio_file_path, lyrics, splitsheet_confirmed FROM tracks WHERE album_id = ? ORDER BY track_number', [albumId]);
        
        res.render('albums/show', { 
            title: album.name,
            album: album,
            tracks: tracks
        });
    } catch (error) {
        console.error('Error fetching album:', error);
        res.status(500).render('error', { title: 'Error', error: 'Error cargando álbum' });
    }
});

module.exports = router;
