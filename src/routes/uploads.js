const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getAll, getOne, run } = require('../config/database');
const { uploadToDrive } = require('../utils/googleDriveHelper');
const { analyzeAndDescribeAudio } = require('../utils/audioHelper');
const { ensureTrackProjectZipColumns } = require('../utils/trackProjectZipSchema');

const PROJECT_ZIP_MAX_BYTES = 10 * 1024 * 1024 * 1024;

function normalizeDurationText(value) {
    if (value === undefined || value === null || value === '') return null;

    const formatSeconds = (secondsValue) => {
        const total = Math.max(0, Math.round(secondsValue));
        const minutes = Math.floor(total / 60);
        const seconds = total % 60;
        return `${minutes}:${String(seconds).padStart(2, '0')}`;
    };

    if (typeof value === 'number' && Number.isFinite(value)) {
        return formatSeconds(value);
    }

    const text = String(value).trim();
    if (!text) return null;

    const mmssMatch = text.match(/^(\d+):([0-5]\d)$/);
    if (mmssMatch) {
        return `${Number(mmssMatch[1])}:${mmssMatch[2]}`;
    }

    const numeric = Number(text.replace(',', '.'));
    if (!Number.isFinite(numeric) || numeric < 0) {
        return null;
    }

    return formatSeconds(numeric);
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let index = 0;
    while (size >= 1024 && index < units.length - 1) {
        size /= 1024;
        index += 1;
    }
    const precision = index <= 1 ? 0 : 2;
    return `${size.toFixed(precision)} ${units[index]}`;
}

function sanitizeZipName(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(0, 180);
}

function getProjectZipDriveUploadOptions() {
    const folderId = String(process.env.GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_ID || '').trim();
    const folderName = String(process.env.GOOGLE_DRIVE_PROJECT_ZIP_FOLDER_NAME || 'EI2_Project_Data_Zips').trim();
    const parentFolderId = String(process.env.GOOGLE_DRIVE_FOLDER_ID || 'root').trim() || 'root';

    return {
        folderId: folderId || undefined,
        folderName: folderName || undefined,
        parentFolderId
    };
}

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

const projectZipStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(process.cwd(), 'temp', 'project-zips');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const timestamp = Date.now();
        const sanitized = sanitizeZipName(file.originalname || 'project-data.zip');
        cb(null, `${timestamp}_${sanitized}`);
    }
});

const projectZipUpload = multer({
    storage: projectZipStorage,
    limits: {
        fileSize: PROJECT_ZIP_MAX_BYTES,
        files: 1
    },
    fileFilter: (req, file, cb) => {
        const isZipExtension = /\.zip$/i.test(file.originalname || '');
        if (!isZipExtension) {
            cb(new Error('Solo se permite archivo ZIP (.zip)'), false);
            return;
        }
        cb(null, true);
    }
});

const projectZipSingleUpload = projectZipUpload.single('project_zip');

function handleProjectZipUpload(req, res, next) {
    projectZipSingleUpload(req, res, (error) => {
        if (!error) {
            next();
            return;
        }

        if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: `Archivo ZIP demasiado grande. Limite maximo: ${formatFileSize(PROJECT_ZIP_MAX_BYTES)}.`
            });
        }

        if (error instanceof multer.MulterError) {
            return res.status(400).json({ error: `Error de upload: ${error.message}` });
        }

        return res.status(400).json({ error: error.message || 'Error subiendo ZIP' });
    });
}

// POST upload project/data ZIP before creating a track
router.post('/project-zip', handleProjectZipUpload, async (req, res) => {
    let localFilePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun ZIP' });
        }

        localFilePath = req.file.path;
        const originalName = req.file.originalname;
        const driveFileName = `track_project_data_${Date.now()}_${sanitizeZipName(originalName || 'project-data.zip')}`;

        const driveUpload = await uploadToDrive(
            localFilePath,
            driveFileName,
            req.file.mimetype || 'application/zip',
            getProjectZipDriveUploadOptions()
        );

        return res.json({
            success: true,
            message: 'ZIP subido a Google Drive',
            projectZip: {
                driveFileId: driveUpload.fileId,
                downloadUrl: driveUpload.downloadUrl,
                viewUrl: driveUpload.viewUrl,
                originalName,
                fileSize: req.file.size,
                uploadedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        console.error('[UPLOADS] Error uploading project ZIP:', error);
        return res.status(500).json({
            error: 'Error subiendo ZIP a Google Drive',
            details: error.message
        });
    } finally {
        if (localFilePath && fs.existsSync(localFilePath)) {
            try {
                fs.unlinkSync(localFilePath);
            } catch (cleanupError) {
                console.warn('[UPLOADS] Could not cleanup temp ZIP file:', cleanupError.message);
            }
        }
    }
});

// POST upload project/data ZIP for an existing track
router.post('/track/:id/project-zip', handleProjectZipUpload, async (req, res) => {
    let localFilePath = null;

    try {
        const trackId = req.params.id;
        if (!req.file) {
            return res.status(400).json({ error: 'No se subio ningun ZIP' });
        }

        await ensureTrackProjectZipColumns();

        const track = await getOne('SELECT id, title FROM tracks WHERE id = ?', [trackId]);
        if (!track) {
            return res.status(404).json({ error: 'Tema no encontrado' });
        }

        localFilePath = req.file.path;
        const originalName = req.file.originalname;
        const driveFileName = `track_${trackId}_project_data_${Date.now()}_${sanitizeZipName(originalName || 'project-data.zip')}`;

        const driveUpload = await uploadToDrive(
            localFilePath,
            driveFileName,
            req.file.mimetype || 'application/zip',
            getProjectZipDriveUploadOptions()
        );
        const uploadedAt = new Date();

        await run(
            `UPDATE tracks
             SET project_zip_drive_file_id = ?,
                 project_zip_drive_download_url = ?,
                 project_zip_drive_view_url = ?,
                 project_zip_original_name = ?,
                 project_zip_file_size = ?,
                 project_zip_uploaded_at = ?
             WHERE id = ?`,
            [
                driveUpload.fileId,
                driveUpload.downloadUrl,
                driveUpload.viewUrl,
                originalName,
                req.file.size,
                uploadedAt,
                trackId
            ]
        );

        await logActivity(
            'PROJECT_ZIP_UPLOAD',
            'track',
            trackId,
            `Proyecto/Data ZIP subido a Drive: ${originalName} (${formatFileSize(req.file.size)})`
        );

        return res.json({
            success: true,
            message: 'ZIP del proyecto subido y vinculado al tema',
            projectZip: {
                driveFileId: driveUpload.fileId,
                downloadUrl: driveUpload.downloadUrl,
                viewUrl: driveUpload.viewUrl,
                originalName,
                fileSize: req.file.size,
                uploadedAt: uploadedAt.toISOString()
            }
        });
    } catch (error) {
        console.error('[UPLOADS] Error uploading track project ZIP:', error);
        return res.status(500).json({
            error: 'Error subiendo ZIP del tema a Google Drive',
            details: error.message
        });
    } finally {
        if (localFilePath && fs.existsSync(localFilePath)) {
            try {
                fs.unlinkSync(localFilePath);
            } catch (cleanupError) {
                console.warn('[UPLOADS] Could not cleanup temp ZIP file:', cleanupError.message);
            }
        }
    }
});

// DELETE remove project/data ZIP association from a track
router.delete('/track/:id/project-zip', async (req, res) => {
    try {
        const trackId = req.params.id;
        await ensureTrackProjectZipColumns();

        const track = await getOne(
            `SELECT id, project_zip_drive_file_id, project_zip_original_name
             FROM tracks
             WHERE id = ?`,
            [trackId]
        );

        if (!track) {
            return res.status(404).json({ error: 'Tema no encontrado' });
        }

        if (!track.project_zip_drive_file_id) {
            return res.status(404).json({ error: 'Este tema no tiene ZIP vinculado' });
        }

        await run(
            `UPDATE tracks
             SET project_zip_drive_file_id = NULL,
                 project_zip_drive_download_url = NULL,
                 project_zip_drive_view_url = NULL,
                 project_zip_original_name = NULL,
                 project_zip_file_size = NULL,
                 project_zip_uploaded_at = NULL
             WHERE id = ?`,
            [trackId]
        );

        await logActivity(
            'PROJECT_ZIP_DELETE',
            'track',
            trackId,
            `Proyecto/Data ZIP desvinculado: ${track.project_zip_original_name || track.project_zip_drive_file_id}`
        );

        return res.json({
            success: true,
            message: 'ZIP desvinculado del tema'
        });
    } catch (error) {
        console.error('[UPLOADS] Error deleting track project ZIP link:', error);
        return res.status(500).json({
            error: 'Error desvinculando ZIP del tema',
            details: error.message
        });
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
        
        // Obtener info del track para generar descripción
        const track = await getOne('SELECT t.title, p.name as producer_name FROM tracks t LEFT JOIN producers p ON t.producer_id = p.id WHERE t.id = ?', [trackId]);
        const trackTitle = track?.title || 'Unknown Track';
        const producer = track?.producer_name || 'El Inmortal 2 Team';
        
        // Analizar audio y generar descripción (proceso asíncrono, no bloqueamos la respuesta)
        let duration = null;
        let audioDescription = null;
        
        try {
            console.log(`[UPLOADS] Analyzing audio for: ${trackTitle}`);
            const analysis = await analyzeAndDescribeAudio(localFilePath, trackTitle, producer);
            duration = normalizeDurationText(analysis.duration);
            audioDescription = analysis.description;
            console.log(`[UPLOADS] ✅ Audio analyzed - Duration: ${duration}`);
        } catch (analysisError) {
            console.warn(`[UPLOADS] Could not analyze audio: ${analysisError.message}`);
            // Si falla el análisis, solo extraemos duración
            try {
                const { getAudioDuration } = require('../utils/audioHelper');
                duration = normalizeDurationText(await getAudioDuration(localFilePath));
            } catch (e) {
                console.warn(`[UPLOADS] Could not extract duration either`);
            }
        }
        
        await run(
            `UPDATE tracks 
             SET audio_file_path = ?, audio_file_type = ?, duration = ?, audio_description = ?
             WHERE id = ?`,
            [fileStoragePath, file_type || 'master', duration, audioDescription, trackId]
        );
        
        // Log activity
        await logActivity('AUDIO_UPLOAD', 'track', trackId, 
            `Audio subido (${storageType}): ${originalName} (${file_type || 'master'})`);
        
        res.json({ 
            success: true, 
            message: `Archivo de audio subido exitosamente (${storageType})`,
            filePath: fileStoragePath,
            fileType: file_type || 'master',
            duration: duration,
            hasDescription: !!audioDescription,
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
        
        // Extraer duración del nuevo audio
        let duration = null;
        try {
            const newFileFullPath = path.join(process.cwd(), 'public', newFilePath);
            duration = normalizeDurationText(await getAudioDuration(newFileFullPath));
            console.log(`[UPLOADS] Audio duration extracted: ${duration}`);
        } catch (durationError) {
            console.warn(`[UPLOADS] Could not extract duration: ${durationError.message}`);
        }
        
        // Update database with new file
        await run(
            `UPDATE tracks 
             SET audio_file_path = ?, audio_file_type = ?, duration = ?
             WHERE id = ?`,
            [newFilePath, file_type || 'master', duration, trackId]
        );
        
        // Log activity
        await logActivity('AUDIO_REPLACE', 'track', trackId, 
            `Audio reemplazado: ${oldFileName} → ${newFileName} (${file_type || 'master'})`);
        
        res.json({ 
            success: true, 
            message: 'Audio reemplazado exitosamente',
            newFilePath: newFilePath,
            fileType: file_type || 'master',
            duration: duration,
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
