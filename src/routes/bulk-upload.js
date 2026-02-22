const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, run } = require('../config/database');

// Configure multer for multiple file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'public/uploads/audio');
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
        fileSize: 100 * 1024 * 1024, // 100MB per file
        files: 25 // max 25 files at once
    }
});

// GET bulk upload page
router.get('/', async (req, res) => {
    try {
        // Get all tracks without audio
        const tracks = await getAll('SELECT id, track_number, title, audio_file_path FROM tracks ORDER BY track_number');
        
        res.render('tracks/bulk-upload', {
            title: 'Subir Audio en Lote',
            tracks: tracks
        });
    } catch (error) {
        console.error('Error loading bulk upload:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando página de subida masiva'
        });
    }
});

// POST upload multiple files
router.post('/', upload.array('audio_files', 25), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: 'No se subieron archivos' });
        }
        
        const uploadedFiles = req.files.map(file => ({
            originalName: file.originalname,
            fileName: file.filename,
            filePath: `/uploads/audio/${file.filename}`,
            size: file.size
        }));
        
        res.json({
            success: true,
            message: `${uploadedFiles.length} archivos subidos exitosamente`,
            files: uploadedFiles
        });
    } catch (error) {
        console.error('Error uploading files:', error);
        res.status(500).json({ error: 'Error subiendo archivos' });
    }
});

// POST map files to tracks
router.post('/bulk-map', async (req, res) => {
    try {
        const mappings = req.body.mappings; // Array of { trackId, filePath, fileType }
        
        if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
            return res.status(400).json({ error: 'No se proporcionaron mapeos' });
        }
        
        let successCount = 0;
        let errorCount = 0;
        const results = [];
        
        for (const mapping of mappings) {
            try {
                const { trackId, filePath, fileType } = mapping;
                
                // Validate track exists
                const track = await getOne('SELECT id, title FROM tracks WHERE id = ?', [trackId]);
                if (!track) {
                    throw new Error('Track no encontrado: ' + trackId);
                }
                
                // Update track with audio file
                await run(
                    'UPDATE tracks SET audio_file_path = ?, audio_file_type = ? WHERE id = ?',
                    [filePath, fileType || 'master', trackId]
                );
                
                results.push({
                    trackId: trackId,
                    title: track.title,
                    filePath: filePath,
                    status: 'success'
                });
                
                successCount++;
                
            } catch (err) {
                results.push({
                    trackId: mapping.trackId,
                    filePath: mapping.filePath,
                    status: 'error',
                    error: err.message
                });
                errorCount++;
            }
        }
        
        res.json({
            success: true,
            message: `${successCount} archivos mapeados exitosamente, ${errorCount} errores`,
            mapped: successCount,
            errors: errorCount,
            results: results
        });
        
    } catch (error) {
        console.error('Error mapping files:', error);
        res.status(500).json({ error: 'Error mapeando archivos' });
    }
});

module.exports = router;
