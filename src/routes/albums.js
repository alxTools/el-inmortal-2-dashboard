const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');

// GET all albums
router.get('/', async (req, res) => {
    try {
        // Check if user is admin or fan
        const isAdmin = req.session?.user?.role === 'admin' || req.session?.user?.role === 'super_admin';
        
        let sql = `
            SELECT 
                a.*, 
                COUNT(t.id) AS track_count,
                SUM(CASE WHEN t.splitsheet_confirmed = 1 THEN 1 ELSE 0 END) AS confirmed_tracks
            FROM album_info a
            LEFT JOIN tracks t ON t.album_id = a.id
        `;
        
        // If fan, only show public albums
        if (!isAdmin) {
            sql += ` WHERE a.is_public = 1`;
        }
        
        sql += ` GROUP BY a.id ORDER BY a.created_at DESC`;
        
        const albums = await getAll(sql);

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
            albumStats: albumStats,
            isAdmin: isAdmin
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
        const isAdmin = req.session?.user?.role === 'admin' || req.session?.user?.role === 'super_admin';
        
        let albumSql = 'SELECT * FROM album_info WHERE id = ?';
        
        // If fan, only show if public
        if (!isAdmin) {
            albumSql += ' AND is_public = 1';
        }
        
        const album = await getOne(albumSql, [albumId]);
        
        if (!album) {
            return res.status(404).render('error', { title: 'Error', error: 'Álbum no encontrado' });
        }
        
        let tracksSql = 'SELECT id, track_number, title, audio_file_path, lyrics, splitsheet_confirmed, is_public FROM tracks WHERE album_id = ?';
        
        // If fan, only show public tracks
        if (!isAdmin) {
            tracksSql += ' AND is_public = 1';
        }
        
        tracksSql += ' ORDER BY track_number';
        
        const tracks = await getAll(tracksSql, [albumId]);
        
        res.render('albums/show', { 
            title: album.name,
            album: album,
            tracks: tracks,
            isAdmin: isAdmin
        });
    } catch (error) {
        console.error('Error fetching album:', error);
        res.status(500).render('error', { title: 'Error', error: 'Error cargando álbum' });
    }
});

// POST toggle album visibility (admin only)
router.post('/:id/toggle-visibility', async (req, res) => {
    try {
        const albumId = req.params.id;
        
        // Get current status
        const album = await getOne('SELECT is_public FROM album_info WHERE id = ?', [albumId]);
        
        if (!album) {
            return res.status(404).json({ error: 'Álbum no encontrado' });
        }
        
        // Toggle
        const newStatus = album.is_public ? 0 : 1;
        await run('UPDATE album_info SET is_public = ? WHERE id = ?', [newStatus, albumId]);
        
        res.json({ 
            success: true, 
            is_public: newStatus,
            message: newStatus ? 'Álbum publicado' : 'Álbum privado'
        });
    } catch (error) {
        console.error('Error toggling album visibility:', error);
        res.status(500).json({ error: 'Error cambiando visibilidad' });
    }
});

// POST toggle track visibility (admin only)
router.post('/:id/tracks/:trackId/toggle-visibility', async (req, res) => {
    try {
        const trackId = req.params.trackId;
        
        // Get current status
        const track = await getOne('SELECT is_public FROM tracks WHERE id = ?', [trackId]);
        
        if (!track) {
            return res.status(404).json({ error: 'Track no encontrado' });
        }
        
        // Toggle
        const newStatus = track.is_public ? 0 : 1;
        await run('UPDATE tracks SET is_public = ? WHERE id = ?', [newStatus, trackId]);
        
        res.json({ 
            success: true, 
            is_public: newStatus,
            message: newStatus ? 'Track publicado' : 'Track privado'
        });
    } catch (error) {
        console.error('Error toggling track visibility:', error);
        res.status(500).json({ error: 'Error cambiando visibilidad' });
    }
});

module.exports = router;
