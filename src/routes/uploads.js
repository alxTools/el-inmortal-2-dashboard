const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, run } = require('../config/database');
const { uploadToDrive, isGoogleDrivePath } = require('../utils/googleDriveHelper');

// Helper function to log activity
async function logActivity(action, entityType, entityId, details) {
    try {
        await run(
            `INSERT INTO activity_log (action, entity_type, entity_id, details) 
             VALUES (?, ?, ?, ?)`,
            [action, entityType, entityId, details]
        );
    } catch (err) {
        console.error('Error logging activity:', err);
    }
}

// Debug: Log all requests to this router
router.use((req, res, next) => {
    console.log(`[UPLOADS] ${req.method} ${req.path} - Track ID: ${req.params.id || 'N/A'}`);
    next();
});

// Test route to verify uploads router is working
router.get('/test', (req, res) => {
    res.json({ success: true, message: 'Uploads router is working!' });
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, '../../public/uploads');
        
        // Create subdirectories based on file type
        let subDir = 'misc';
        if (file.fieldname === 'audio_file') {
            subDir = 'audio';
        } else if (file.fieldname === 'cover_image' || file.fieldname === 'album_cover') {
            subDir = 'images';
        }
        
        const fullPath = path.join(uploadDir, subDir);
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(fullPath)) {
            fs.mkdirSync(fullPath, { recursive: true });
        }
        
        cb(null, fullPath);
    },
    filename: function (req, file, cb) {
        // Sanitize filename
        const timestamp = Date.now();
        const sanitized = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        cb(null, `${timestamp}_${sanitized}`);
    }
});

// File filter
const fileFilter = (req, file, cb) => {
    if (file.fieldname === 'audio_file') {
        // Accept audio files
        if (file.mimetype.startsWith('audio/') || 
            file.originalname.match(/\.(wav|mp3|m4a|flac|aac)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos de audio (WAV, MP3, M4A, FLAC, AAC)'), false);
        }
    } else if (file.fieldname === 'cover_image' || file.fieldname === 'album_cover') {
        // Accept image files
        if (file.mimetype.startsWith('image/') || 
            file.originalname.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes (JPG, PNG, GIF, WEBP)'), false);
        }
    } else {
        cb(null, true);
    }
};

const upload = multer({ 
    storage: storage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max for audio
        files: 2 // max 2 files per request
    }
});

// POST upload audio file for a track
router.post('/track/:id/audio', upload.single('audio_file'), async (req, res) => {
    try {
        const trackId = req.params.id;
        const { file_type } = req.body; // master, acapella, beat, show
        
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }
        
        const localFilePath = req.file.path;
        const originalName = req.file.originalname;
        
        console.log(`[UPLOADS] Processing audio upload: ${originalName}`);
        
        // Use local storage only (no Google Drive)
        const fileStoragePath = `/uploads/audio/${req.file.filename}`;
        const storageType = 'local';
        
        console.log(`[UPLOADS] Audio saved locally: ${fileStoragePath}`);
        
        await run(
            `UPDATE tracks 
             SET audio_file_path = ?, audio_file_type = ?
             WHERE id = ?`,
            [fileStoragePath, file_type || 'master', trackId]
        );
        
        // Log activity
        await logActivity('AUDIO_UPLOAD', 'track', trackId, 
            `Audio subido (${storageType}): ${originalName} (${file_type || 'master'})`);
        
        res.json({ 
            success: true, 
            message: `Archivo de audio subido exitosamente (${storageType})`,
            filePath: fileStoragePath,
            fileType: file_type || 'master',
            storage: storageType
        });
    } catch (error) {
        console.error('Error uploading audio:', error);
        res.status(500).json({ error: 'Error subiendo archivo de audio', details: error.message });
    }
});

// POST upload cover image for a track
router.post('/track/:id/cover', upload.single('cover_image'), async (req, res) => {
    try {
        const trackId = req.params.id;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ninguna imagen' });
        }
        
        const filePath = `/uploads/images/${req.file.filename}`;

        // Remove previous cover file if it exists and is local
        const existingTrack = await getOne('SELECT cover_image_path FROM tracks WHERE id = ?', [trackId]);
        const previousCoverPath = existingTrack?.cover_image_path;
        if (previousCoverPath && previousCoverPath.startsWith('/uploads/images/')) {
            const appRoot = process.cwd();
            const fullPreviousPath = path.join(appRoot, 'public', previousCoverPath);
            if (fs.existsSync(fullPreviousPath)) {
                try {
                    fs.unlinkSync(fullPreviousPath);
                } catch (unlinkError) {
                    console.warn('[UPLOADS] Could not remove previous cover:', unlinkError.message);
                }
            }
        }
        
        await run(
            `UPDATE tracks 
             SET cover_image_path = ?
             WHERE id = ?`,
            [filePath, trackId]
        );

        await logActivity('COVER_UPLOAD', 'track', trackId, `Cover subido: ${req.file.originalname}`);
        
        res.json({ 
            success: true, 
            message: 'Imagen de cover subida exitosamente',
            filePath: filePath
        });
    } catch (error) {
        console.error('Error uploading cover:', error);
        res.status(500).json({ error: 'Error subiendo imagen de cover' });
    }
});

// DELETE cover image for a track
router.delete('/track/:id/cover', async (req, res) => {
    try {
        const trackId = req.params.id;

        const track = await getOne('SELECT id, cover_image_path FROM tracks WHERE id = ?', [trackId]);
        if (!track || !track.cover_image_path) {
            return res.status(404).json({ error: 'No hay cover para eliminar' });
        }

        const oldCoverPath = track.cover_image_path;
        const oldCoverName = oldCoverPath.split('/').pop();

        if (oldCoverPath.startsWith('/uploads/images/')) {
            const appRoot = process.cwd();
            const fullPath = path.join(appRoot, 'public', oldCoverPath);
            if (fs.existsSync(fullPath)) {
                fs.unlinkSync(fullPath);
            }
        }

        await run('UPDATE tracks SET cover_image_path = NULL WHERE id = ?', [trackId]);
        await logActivity('COVER_DELETE', 'track', trackId, `Cover eliminado: ${oldCoverName}`);

        res.json({
            success: true,
            message: 'Cover eliminado exitosamente',
            deletedFile: oldCoverName
        });
    } catch (error) {
        console.error('Error deleting cover:', error);
        res.status(500).json({ error: 'Error eliminando cover' });
    }
});

// POST upload album cover
router.post('/album/cover', upload.single('album_cover'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ninguna imagen' });
        }
        
        const filePath = `/uploads/images/${req.file.filename}`;
        
        // Check if album info exists
        const albumInfo = await getOne('SELECT id FROM album_info LIMIT 1');
        
        if (albumInfo) {
            await run('UPDATE album_info SET cover_image_path = ? WHERE id = ?', 
                [filePath, albumInfo.id]);
        } else {
            await run('INSERT INTO album_info (name, artist, cover_image_path) VALUES (?, ?, ?)',
                ['El Inmortal 2', 'Galante el Emperador', filePath]);
        }
        
        res.json({ 
            success: true, 
            message: 'Cover del álbum subido exitosamente',
            filePath: filePath
        });
    } catch (error) {
        console.error('Error uploading album cover:', error);
        res.status(500).json({ error: 'Error subiendo cover del álbum' });
    }
});

// GET audio file for playback
router.get('/track/:id/audio', async (req, res) => {
    try {
        const trackId = req.params.id;
        
        const track = await getOne('SELECT audio_file_path FROM tracks WHERE id = ?', [trackId]);
        
        if (!track || !track.audio_file_path) {
            return res.status(404).json({ error: 'No hay archivo de audio para este track' });
        }
        
        const appRoot = process.cwd();
        const filePath = path.join(appRoot, 'public', track.audio_file_path);
        
        console.log(`[UPLOADS] Serving audio: ${filePath}`);
        
        if (!fs.existsSync(filePath)) {
            console.log(`[UPLOADS] Audio file not found: ${filePath}`);
            return res.status(404).json({ error: 'Archivo no encontrado en el servidor' });
        }
        
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error serving audio:', error);
        res.status(500).json({ error: 'Error sirviendo archivo de audio' });
    }
});

// DELETE audio file for a track
router.delete('/track/:id/audio', async (req, res) => {
    try {
        const trackId = req.params.id;
        
        // Get current audio info
        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [trackId]);
        
        if (!track || !track.audio_file_path) {
            return res.status(404).json({ error: 'No hay archivo de audio para eliminar' });
        }
        
        const oldFilePath = track.audio_file_path;
        const fileName = oldFilePath.split('/').pop();
        
        // Delete physical file if it exists
        const appRoot = process.cwd();
        const fullPath = path.join(appRoot, 'public', oldFilePath);
        console.log(`[UPLOADS] Deleting file: ${fullPath}`);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`[UPLOADS] File deleted successfully`);
        } else {
            console.log(`[UPLOADS] File not found at: ${fullPath}`);
        }
        
        // Update database
        await run(
            `UPDATE tracks 
             SET audio_file_path = NULL, audio_file_type = NULL
             WHERE id = ?`,
            [trackId]
        );
        
        // Log activity
        await logActivity('AUDIO_DELETE', 'track', trackId, 
            `Audio eliminado: ${fileName}`);
        
        res.json({ 
            success: true, 
            message: 'Audio eliminado exitosamente',
            deletedFile: fileName
        });
    } catch (error) {
        console.error('Error deleting audio:', error);
        res.status(500).json({ error: 'Error eliminando archivo de audio' });
    }
});

// POST replace audio file for a track
router.post('/track/:id/audio/replace', upload.single('audio_file'), async (req, res) => {
    try {
        const trackId = req.params.id;
        const { file_type } = req.body;
        
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún archivo' });
        }
        
        // Get old audio info
        const track = await getOne('SELECT * FROM tracks WHERE id = ?', [trackId]);
        
        const oldFilePath = track?.audio_file_path;
        const oldFileName = oldFilePath ? oldFilePath.split('/').pop() : 'ninguno';
        
        const newFilePath = `/uploads/audio/${req.file.filename}`;
        const newFileName = req.file.originalname;
        
        // Delete old file if it exists
        if (oldFilePath) {
            const appRoot = process.cwd();
            const fullOldPath = path.join(appRoot, 'public', oldFilePath);
            console.log(`[UPLOADS] Replacing - deleting old file: ${fullOldPath}`);
            if (fs.existsSync(fullOldPath)) {
                fs.unlinkSync(fullOldPath);
                console.log(`[UPLOADS] Old file deleted`);
            }
        }
        
        // Update database with new file
        await run(
            `UPDATE tracks 
             SET audio_file_path = ?, audio_file_type = ?
             WHERE id = ?`,
            [newFilePath, file_type || 'master', trackId]
        );
        
        // Log activity
        await logActivity('AUDIO_REPLACE', 'track', trackId, 
            `Audio reemplazado: ${oldFileName} → ${newFileName} (${file_type || 'master'})`);
        
        res.json({ 
            success: true, 
            message: 'Audio reemplazado exitosamente',
            newFilePath: newFilePath,
            fileType: file_type || 'master',
            oldFile: oldFileName,
            newFile: newFileName
        });
    } catch (error) {
        console.error('Error replacing audio:', error);
        res.status(500).json({ error: 'Error reemplazando archivo de audio' });
    }
});

// POST upload avatar for producer/artist/composer with crop
router.post('/avatar/:type/:id', upload.single('avatar'), async (req, res) => {
    try {
        const { type, id } = req.params; // type: 'producer', 'composer', 'artist'
        const { cropData } = req.body; // JSON with crop coordinates
        
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ninguna imagen' });
        }
        
        // Validate type
        const validTypes = ['producer', 'composer', 'artist'];
        if (!validTypes.includes(type)) {
            return res.status(400).json({ error: 'Tipo inválido' });
        }
        
        const filePath = `/uploads/avatars/${req.file.filename}`;
        
        // Update database
        let tableName;
        switch(type) {
            case 'producer': tableName = 'producers'; break;
            case 'composer': tableName = 'composers'; break;
            case 'artist': tableName = 'artists'; break;
        }
        
        await run(
            `UPDATE ${tableName} 
             SET avatar_path = ?, avatar_crop_data = ?
             WHERE id = ?`,
            [filePath, cropData || null, id]
        );
        
        await logActivity('AVATAR_UPLOAD', type, id, `Avatar actualizado`);
        
        res.json({ 
            success: true, 
            message: 'Avatar subido exitosamente',
            filePath: filePath,
            type: type,
            id: id
        });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ error: 'Error subiendo avatar' });
    }
});

// GET activity log for a track
router.get('/track/:id/log', async (req, res) => {
    try {
        const trackId = req.params.id;
        
        const activities = await getAll(`
            SELECT * FROM activity_log 
            WHERE entity_type = 'track' AND entity_id = ?
            ORDER BY created_at DESC
        `, [trackId]);
        
        res.json({
            success: true,
            trackId: trackId,
            activities: activities || []
        });
    } catch (error) {
        console.error('Error fetching activity log:', error);
        res.status(500).json({ error: 'Error obteniendo historial' });
    }
});

module.exports = router;
