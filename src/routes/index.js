const express = require('express');
const router = express.Router();
const { getDatabase } = require('../config/database');

// GET home page / dashboard
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        
        // Get statistics
        const stats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as total_tracks,
                    SUM(CASE WHEN splitsheet_sent = 1 THEN 1 ELSE 0 END) as splitsheets_sent,
                    SUM(CASE WHEN splitsheet_confirmed = 1 THEN 1 ELSE 0 END) as splitsheets_confirmed,
                    SUM(content_count) as total_content
                FROM tracks
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        // Get producers count
        const producerCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM producers', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        // Get urgent tasks count
        const urgentTasks = await new Promise((resolve, reject) => {
            db.get(`
                SELECT COUNT(*) as count 
                FROM checklist_items 
                WHERE priority = 'urgent' AND completed = 0
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        // Get recent tracks
        const recentTracks = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, p.name as producer_name
                FROM tracks t
                LEFT JOIN producers p ON t.producer_id = p.id
                ORDER BY t.track_number
                LIMIT 5
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        // Calculate launch date
        const launchDate = new Date('2026-02-17T00:00:00');
        const now = new Date();
        const daysUntilLaunch = Math.ceil((launchDate - now) / (1000 * 60 * 60 * 24));

        res.render('index', {
            title: 'Dashboard - El Inmortal 2',
            stats: {
                totalTracks: stats.total_tracks || 0,
                totalTracksTarget: 21,
                producerCount: producerCount || 0,
                splitsheetsSent: stats.splitsheets_sent || 0,
                splitsheetsConfirmed: stats.splitsheets_confirmed || 0,
                totalContent: stats.total_content || 0,
                totalContentTarget: 63,
                urgentTasks: urgentTasks || 0,
                daysUntilLaunch: daysUntilLaunch
            },
            recentTracks: recentTracks,
            launchDate: launchDate
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando el dashboard',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET countdown data
router.get('/countdown', (req, res) => {
    const launchDate = new Date('2026-02-17T00:00:00');
    const now = new Date();
    const diff = launchDate - now;

    const dailyTimers = {
        'tm2': new Date('2026-02-15T00:00:00'),
        'tm1': new Date('2026-02-16T00:00:00'),
        't0': new Date('2026-02-17T00:00:00'),
        't1': new Date('2026-02-18T00:00:00'),
        't7': new Date('2026-02-24T00:00:00'),
        't21': new Date('2026-03-10T00:00:00')
    };

    const timers = {};
    for (const [key, date] of Object.entries(dailyTimers)) {
        const timeDiff = date - now;
        timers[key] = {
            days: Math.floor(timeDiff / (1000 * 60 * 60 * 24)),
            hours: Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
            minutes: Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60)),
            seconds: Math.floor((timeDiff % (1000 * 60)) / 1000),
            isActive: timeDiff <= 0 && timeDiff > -86400000,
            isPast: timeDiff <= -86400000
        };
    }

    res.json({
        launchDate: launchDate,
        currentTime: now,
        timers: timers
    });
});

module.exports = router;