const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const { getAll, getOne, run } = require('../config/database');
const { analyzeAndDescribeAudio } = require('../utils/audioHelper');

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
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('tracks/new', {
            title: 'Nuevo Tema',
            errors: errors.array(),
            formData: req.body
        });
    }

    try {
        const { track_number, title, producer_id, recording_date, lyrics } = req.body;
        
        // Si se subió audio, procesarlo
        let audioFilePath = null;
        let duration = null;
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
                duration = analysis.duration;
                audioDescription = analysis.description;
                console.log(`[Tracks] ✅ Audio analyzed - Duration: ${duration}`);
            } catch (analysisError) {
                console.warn(`[Tracks] Could not analyze audio: ${analysisError.message}`);
            }
        }

        await run(
            `INSERT INTO tracks (track_number, title, producer_id, recording_date, duration, lyrics, audio_file_path, audio_file_type, audio_description)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [track_number, title, producer_id || null, recording_date, duration, lyrics, audioFilePath, audioFilePath ? 'master' : null, audioDescription]
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

        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [trackId]);

        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Tema no encontrado',
                error: {}
            });
        }

        const producers = await getAll('SELECT * FROM producers ORDER BY name');

        res.render('tracks/edit', {
            title: `Editar: ${track.title}`,
            track: track,
            producers: producers || []
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
        const { title, producer_id, recording_date, duration, lyrics, status, is_single, is_primary, track_type } = req.body;

        await run(
            `UPDATE tracks 
             SET title = ?, producer_id = ?, recording_date = ?, 
                 duration = ?, lyrics = ?, status = ?, 
                 is_single = ?, is_primary = ?, track_type = ?
             WHERE id = ?`,
            [
                title, 
                producer_id || null, 
                recording_date || null, 
                duration, 
                lyrics, 
                status, 
                is_single ? 1 : 0, 
                is_primary ? 1 : 0, 
                track_type || 'album', 
                trackId
            ]
        );

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
        const trackId = req.params.id;

        await run('DELETE FROM tracks WHERE id = ?', [trackId]);

        res.json({ success: true, message: 'Tema eliminado' });
    } catch (error) {
        console.error('Error deleting track:', error);
        res.status(500).json({ success: false, message: 'Error eliminando tema' });
    }
});

module.exports = router;
