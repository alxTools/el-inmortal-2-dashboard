/**
 * Landing Page Public API
 * Rutas públicas para acceder a información de tracks (requiere cookie de verificación)
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { getOne, getAll } = require('../config/database');
const { generatePromo } = require('../utils/promoGenerator');

const router = express.Router();

const FALLBACK_COVER = '/uploads/images/el_inmortal_2_cover_1771220102312.png';

/**
 * Middleware para verificar cookie de desbloqueo
 */
function requireUnlockCookie(req, res, next) {
    const isAdmin = req.session?.user ? true : false;
    const hasUnlockCookie = req.cookies?.landing_el_inmortal_unlock === '1';
    
    if (!isAdmin && !hasUnlockCookie) {
        return res.status(403).json({
            success: false,
            error: 'Acceso denegado. Por favor, regístrate y verifica tu email para acceder a este contenido.',
            code: 'UNAUTHORIZED'
        });
    }
    
    next();
}

/**
 * GET /api/landing/tracks
 * Lista todos los tracks (información pública)
 */
router.get('/tracks', requireUnlockCookie, async (req, res) => {
    try {
        const tracks = await getAll(`
            SELECT 
                t.id,
                t.track_number,
                t.title,
                t.duration,
                t.features,
                t.cover_image_path,
                p.name as producer_name
            FROM tracks t
            LEFT JOIN producers p ON p.id = t.producer_id
            ORDER BY t.track_number ASC
            LIMIT 30
        `);
        
        // Sanitizar y formatear respuesta
        const safeTracks = tracks.map(track => ({
            id: track.id,
            trackNumber: track.track_number,
            title: track.title,
            duration: track.duration,
            features: track.features,
            producer: track.producer_name,
            coverImage: track.cover_image_path ? 
                `/uploads/images/${path.basename(track.cover_image_path)}` : 
                FALLBACK_COVER,
            // Loop URLs se generarán dinámicamente
            loops: [
                { id: 1, label: 'Loop 1', duration: '0:15' },
                { id: 2, label: 'Loop 2', duration: '0:15' },
                { id: 3, label: 'Loop 3', duration: '0:15' },
                { id: 4, label: 'Loop 4', duration: '0:15' }
            ]
        }));
        
        res.json({
            success: true,
            count: safeTracks.length,
            tracks: safeTracks
        });
        
    } catch (error) {
        console.error('[Landing API] Error obteniendo tracks:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/landing/tracks/:id
 * Obtiene información detallada de un track específico
 */
router.get('/tracks/:id', requireUnlockCookie, async (req, res) => {
    try {
        const trackId = req.params.id;
        
        const track = await getOne(`
            SELECT 
                t.id,
                t.track_number,
                t.title,
                t.duration,
                t.features,
                t.lyrics,
                t.cover_image_path,
                t.audio_file_path,
                p.name as producer_name
            FROM tracks t
            LEFT JOIN producers p ON p.id = t.producer_id
            WHERE t.id = ?
        `, [trackId]);
        
        if (!track) {
            return res.status(404).json({
                success: false,
                error: 'Track no encontrado',
                code: 'NOT_FOUND'
            });
        }
        
        // Generar URLs de loops (si existen)
        const loopUrls = [];
        for (let i = 1; i <= 4; i++) {
            loopUrls.push({
                id: i,
                label: `Loop ${i}`,
                url: `/uploads/loops/track_${trackId}_loop_${i}.wav`,
                duration: '0:15'
            });
        }
        
        res.json({
            success: true,
            track: {
                id: track.id,
                trackNumber: track.track_number,
                title: track.title,
                duration: track.duration,
                features: track.features,
                producer: track.producer_name,
                coverImage: track.cover_image_path ? 
                    `/uploads/images/${path.basename(track.cover_image_path)}` : 
                    FALLBACK_COVER,
                lyrics: track.lyrics,
                audioUrl: track.audio_file_path ? 
                    `/uploads/audio/${path.basename(track.audio_file_path)}` : 
                    null,
                loops: loopUrls
            }
        });
        
    } catch (error) {
        console.error('[Landing API] Error obteniendo track:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            code: 'SERVER_ERROR'
        });
    }
});

/**
 * GET /api/landing/check-auth
 * Verifica si el usuario tiene acceso (para el frontend)
 */
router.get('/check-auth', (req, res) => {
    const isAdmin = req.session?.user ? true : false;
    const hasUnlockCookie = req.cookies?.landing_el_inmortal_unlock === '1';
    
    res.json({
        success: true,
        isAuthenticated: isAdmin || hasUnlockCookie,
        isAdmin,
        hasUnlockCookie
    });
});

// Configuración de multer para subida de fotos
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB máximo
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no válido. Use JPG o PNG.'), false);
        }
    }
});

/**
 * POST /api/landing/generate-promo
 * Genera un promo combinando foto del fan con artwork del track
 */
router.post('/generate-promo', requireUnlockCookie, upload.single('photo'), async (req, res) => {
    try {
        const { trackId, templateId } = req.body;
        
        // Validaciones
        if (!trackId) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere trackId',
                code: 'MISSING_TRACK_ID'
            });
        }
        
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere una foto',
                code: 'MISSING_PHOTO'
            });
        }
        
        const template = parseInt(templateId) || 1;
        if (template < 1 || template > 4) {
            return res.status(400).json({
                success: false,
                error: 'Template inválido. Use 1-4',
                code: 'INVALID_TEMPLATE'
            });
        }
        
        // Obtener artwork del track
        const track = await getOne(
            'SELECT cover_image_path FROM tracks WHERE id = ?',
            [trackId]
        );
        
        if (!track) {
            return res.status(404).json({
                success: false,
                error: 'Track no encontrado',
                code: 'TRACK_NOT_FOUND'
            });
        }
        
        // Cargar artwork (usar cover del álbum como fallback)
        let artworkPath = track.cover_image_path;
        if (!artworkPath) {
            artworkPath = path.join(__dirname, '..', '..', 'public', 'uploads', 'images', 'el_inmortal_2_cover_1771220102312.png');
        } else if (!artworkPath.startsWith('/')) {
            artworkPath = path.join(__dirname, '..', '..', 'public', artworkPath);
        }
        
        if (!fs.existsSync(artworkPath)) {
            // Fallback a cover genérico
            artworkPath = path.join(__dirname, '..', '..', 'public', 'uploads', 'images', 'el_inmortal_2_cover_1771220102312.png');
        }
        
        const artworkBuffer = fs.readFileSync(artworkPath);
        const fanPhotoBuffer = req.file.buffer;
        
        // Generar promo
        const promoBuffer = await generatePromo(fanPhotoBuffer, artworkBuffer, template);
        
        // Enviar imagen
        res.set('Content-Type', 'image/png');
        res.set('Content-Disposition', `attachment; filename="promo_${trackId}_template${template}.png"`);
        res.send(promoBuffer);
        
        console.log(`[Promo API] Promo generado para track ${trackId}, template ${template}`);
        
    } catch (error) {
        console.error('[Promo API] Error generando promo:', error);
        res.status(500).json({
            success: false,
            error: 'Error generando promo',
            details: error.message,
            code: 'GENERATION_ERROR'
        });
    }
});

/**
 * POST /api/landing/generate-promo-preview
 * Genera un preview del promo (más ligero, para mostrar en el modal)
 */
router.post('/generate-promo-preview', requireUnlockCookie, upload.single('photo'), async (req, res) => {
    try {
        const { trackId, templateId } = req.body;
        
        if (!trackId || !req.file) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere trackId y foto'
            });
        }
        
        const template = parseInt(templateId) || 1;
        
        // Obtener artwork
        const track = await getOne(
            'SELECT cover_image_path FROM tracks WHERE id = ?',
            [trackId]
        );
        
        let artworkPath = track?.cover_image_path;
        if (!artworkPath || !fs.existsSync(artworkPath)) {
            artworkPath = path.join(__dirname, '..', '..', 'public', 'uploads', 'images', 'el_inmortal_2_cover_1771220102312.png');
        }
        
        const artworkBuffer = fs.readFileSync(artworkPath);
        
        // Generar a menor resolución para preview (540x540)
        const sharp = require('sharp');
        const resizedFan = await sharp(req.file.buffer)
            .resize(540, 540, { fit: 'cover' })
            .toBuffer();
        
        const resizedArtwork = await sharp(artworkBuffer)
            .resize(540, 540, { fit: 'cover' })
            .toBuffer();
        
        // Generar promo con imágenes redimensionadas
        const { generatePromo } = require('../utils/promoGenerator');
        const promoBuffer = await generatePromo(resizedFan, resizedArtwork, template);
        
        res.set('Content-Type', 'image/png');
        res.send(promoBuffer);
        
    } catch (error) {
        console.error('[Promo API] Error en preview:', error);
        res.status(500).json({
            success: false,
            error: 'Error generando preview'
        });
    }
});

module.exports = router;
