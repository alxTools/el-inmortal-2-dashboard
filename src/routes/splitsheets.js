const express = require('express');
const router = express.Router();
const { getDatabase } = require('../config/database');

// GET splitsheets dashboard
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        
        const splitsheets = await new Promise((resolve, reject) => {
            db.all(`
                SELECT s.*, t.title as track_title, t.track_number, p.name as producer_name, p.email as producer_email
                FROM splitsheets s
                JOIN tracks t ON s.track_id = t.id
                JOIN producers p ON s.producer_id = p.id
                ORDER BY s.created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('splitsheets/index', {
            title: 'Splitsheets - El Inmortal 2',
            splitsheets: splitsheets
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando splitsheets',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET generate splitsheet for a track
router.get('/generate/:trackId', async (req, res) => {
    try {
        const db = getDatabase();
        const trackId = req.params.trackId;

        const track = await new Promise((resolve, reject) => {
            db.get(`
                SELECT t.*, p.name as producer_name, p.legal_name as producer_legal_name, 
                       p.email as producer_email, p.split_percentage
                FROM tracks t
                JOIN producers p ON t.producer_id = p.id
                WHERE t.id = ?
            `, [trackId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!track) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Track no encontrado',
                error: {}
            });
        }

        res.render('splitsheets/generate', {
            title: `Generar Splitsheet - ${track.title}`,
            track: track
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error generando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

module.exports = router;