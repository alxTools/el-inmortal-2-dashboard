const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, run } = require('../config/database');
const { requireAdmin, requireFanOrAdmin } = require('../middleware/roles');

// GET admin page
router.get('/admin', requireAdmin, (req, res) => {
    res.render('fan-generator/admin', {
        title: 'Fan Generator Admin'
    });
});

// Configurar multer para subida de loops
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads/loops');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `loop_${timestamp}_${sanitized}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('video/') || 
            file.mimetype.startsWith('audio/') ||
            file.originalname.match(/\.(mp4|webm|mp3|wav|m4a)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de video/audio'), false);
        }
    }
});

// GET all active loops (público)
router.get('/loops', async (req, res) => {
    try {
        const loops = await getAll(`
            SELECT id, name, duration, thumbnail_path, created_at
            FROM loops
            WHERE is_active = 1
            ORDER BY created_at DESC
        `);
        
        res.json({ success: true, loops });
    } catch (error) {
        console.error('[Fan Generator] Error fetching loops:', error);
        res.status(500).json({ success: false, error: 'Error cargando loops' });
    }
});

// POST upload new loop (admin only)
router.post('/loops', requireAdmin, upload.single('loop'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, error: 'No se subió ningún archivo' });
        }
        
        const { name, duration } = req.body;
        
        if (!name) {
            return res.status(400).json({ success: false, error: 'Nombre requerido' });
        }
        
        const filePath = `/uploads/loops/${req.file.filename}`;
        
        const result = await run(
            `INSERT INTO loops (name, file_path, duration, created_by) VALUES (?, ?, ?, ?)`,
            [name, filePath, duration || 0, req.session.user.id]
        );
        
        res.json({ 
            success: true, 
            loop: {
                id: result.lastID || result.insertId,
                name,
                file_path: filePath,
                duration: duration || 0
            }
        });
    } catch (error) {
        console.error('[Fan Generator] Error uploading loop:', error);
        res.status(500).json({ success: false, error: 'Error subiendo loop' });
    }
});

// DELETE loop (admin only)
router.delete('/loops/:id', requireAdmin, async (req, res) => {
    try {
        const loopId = req.params.id;
        
        // Soft delete
        await run('UPDATE loops SET is_active = 0 WHERE id = ?', [loopId]);
        
        res.json({ success: true, message: 'Loop eliminado' });
    } catch (error) {
        console.error('[Fan Generator] Error deleting loop:', error);
        res.status(500).json({ success: false, error: 'Error eliminando loop' });
    }
});

// POST create fan video request
router.post('/generate-video', requireFanOrAdmin, async (req, res) => {
    try {
        const { loop_id, user_photo_path } = req.body;
        
        if (!loop_id || !user_photo_path) {
            return res.status(400).json({ 
                success: false, 
                error: 'Loop y foto son requeridos' 
            });
        }
        
        // Verificar que el loop existe
        const loop = await getOne('SELECT id FROM loops WHERE id = ? AND is_active = 1', [loop_id]);
        if (!loop) {
            return res.status(404).json({ success: false, error: 'Loop no encontrado' });
        }
        
        // Obtener user info
        let userId = null;
        let leadId = null;
        
        if (req.session?.user) {
            userId = req.session.user.id;
        } else {
            const leadEmail = req.cookies?.landing_email;
            if (leadEmail) {
                const lead = await getOne('SELECT id FROM landing_email_leads WHERE email = ?', [leadEmail]);
                if (lead) leadId = lead.id;
            }
        }
        
        // Crear registro del video
        const result = await run(
            `INSERT INTO fan_videos (lead_id, user_id, loop_id, user_photo_path, status) 
             VALUES (?, ?, ?, ?, 'pending')`,
            [leadId, userId, loop_id, user_photo_path]
        );
        
        res.json({ 
            success: true, 
            video_id: result.lastID || result.insertId,
            message: 'Video en cola para generación'
        });
    } catch (error) {
        console.error('[Fan Generator] Error creating video:', error);
        res.status(500).json({ success: false, error: 'Error creando video' });
    }
});

// GET video status
router.get('/video/:id', async (req, res) => {
    try {
        const videoId = req.params.id;
        
        const video = await getOne(`
            SELECT v.*, l.name as loop_name, l.file_path as loop_path
            FROM fan_videos v
            JOIN loops l ON v.loop_id = l.id
            WHERE v.id = ?
        `, [videoId]);
        
        if (!video) {
            return res.status(404).json({ success: false, error: 'Video no encontrado' });
        }
        
        res.json({ success: true, video });
    } catch (error) {
        console.error('[Fan Generator] Error fetching video:', error);
        res.status(500).json({ success: false, error: 'Error cargando video' });
    }
});

// POST upload user photo (temp)
router.post('/upload-photo', requireFanOrAdmin, async (req, res) => {
    // El upload se manejará en el frontend con FormData a /uploads
    res.json({ success: true, message: 'Use /uploads endpoint' });
});

module.exports = router;