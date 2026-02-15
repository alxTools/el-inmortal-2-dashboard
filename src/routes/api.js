const express = require('express');
const router = express.Router();
const { getDatabase } = require('../config/database');

// GET dashboard stats
router.get('/stats', async (req, res) => {
    try {
        const db = getDatabase();
        
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

        const producerCount = await new Promise((resolve, reject) => {
            db.get('SELECT COUNT(*) as count FROM producers', (err, row) => {
                if (err) reject(err);
                else resolve(row.count);
            });
        });

        const checklistStats = await new Promise((resolve, reject) => {
            db.get(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN completed = 1 THEN 1 ELSE 0 END) as completed,
                    SUM(CASE WHEN priority = 'urgent' AND completed = 0 THEN 1 ELSE 0 END) as urgent
                FROM checklist_items
            `, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        res.json({
            tracks: {
                total: stats.total_tracks || 0,
                target: 21
            },
            splitsheets: {
                sent: stats.splitsheets_sent || 0,
                confirmed: stats.splitsheets_confirmed || 0,
                pending: (stats.total_tracks || 0) - (stats.splitsheets_confirmed || 0)
            },
            content: {
                total: stats.total_content || 0,
                target: 63
            },
            producers: producerCount || 0,
            checklist: checklistStats
        });
    } catch (error) {
        console.error('API Stats Error:', error);
        res.status(500).json({ error: 'Error fetching stats' });
    }
});

// GET all tracks
router.get('/tracks', async (req, res) => {
    try {
        const db = getDatabase();
        
        const tracks = await new Promise((resolve, reject) => {
            db.all(`
                SELECT t.*, p.name as producer_name, p.email as producer_email
                FROM tracks t
                LEFT JOIN producers p ON t.producer_id = p.id
                ORDER BY t.track_number
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(tracks);
    } catch (error) {
        console.error('API Tracks Error:', error);
        res.status(500).json({ error: 'Error fetching tracks' });
    }
});

// GET all producers
router.get('/producers', async (req, res) => {
    try {
        const db = getDatabase();
        
        const producers = await new Promise((resolve, reject) => {
            db.all(`
                SELECT p.*, COUNT(t.id) as track_count
                FROM producers p
                LEFT JOIN tracks t ON p.id = t.producer_id
                GROUP BY p.id
                ORDER BY p.name
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(producers);
    } catch (error) {
        console.error('API Producers Error:', error);
        res.status(500).json({ error: 'Error fetching producers' });
    }
});

// GET countdown data
router.get('/countdown', (req, res) => {
    const launchDate = new Date('2026-02-17T00:00:00');
    const now = new Date();
    
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
        const diff = date - now;
        timers[key] = {
            days: Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24))),
            hours: Math.max(0, Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))),
            minutes: Math.max(0, Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))),
            seconds: Math.max(0, Math.floor((diff % (1000 * 60)) / 1000)),
            isActive: diff <= 0 && diff > -86400000,
            isPast: diff <= -86400000
        };
    }

    res.json({
        launchDate: launchDate,
        currentTime: now,
        daysUntilLaunch: Math.ceil((launchDate - now) / (1000 * 60 * 60 * 24)),
        timers: timers
    });
});

// POST update track status
router.post('/tracks/:id/status', async (req, res) => {
    try {
        const db = getDatabase();
        const trackId = req.params.id;
        const { field, value } = req.body;

        const validFields = ['splitsheet_sent', 'splitsheet_confirmed', 'status'];
        if (!validFields.includes(field)) {
            return res.status(400).json({ error: 'Invalid field' });
        }

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE tracks SET ${field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `, [value, trackId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Status updated' });
    } catch (error) {
        console.error('API Update Error:', error);
        res.status(500).json({ error: 'Error updating track' });
    }
});

// GET checklist items
router.get('/checklist', async (req, res) => {
    try {
        const db = getDatabase();
        
        const items = await new Promise((resolve, reject) => {
            db.all(`
                SELECT * FROM checklist_items
                ORDER BY 
                    CASE priority 
                        WHEN 'urgent' THEN 1 
                        WHEN 'high' THEN 2 
                        WHEN 'normal' THEN 3 
                        ELSE 4 
                    END,
                    created_at DESC
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.json(items);
    } catch (error) {
        console.error('API Checklist Error:', error);
        res.status(500).json({ error: 'Error fetching checklist' });
    }
});

// POST toggle checklist item
router.post('/checklist/:id/toggle', async (req, res) => {
    try {
        const db = getDatabase();
        const itemId = req.params.id;
        
        console.log(`[API] Toggling checklist item ${itemId}`);

        // Get current state first
        const currentItem = await new Promise((resolve, reject) => {
            db.get('SELECT completed FROM checklist_items WHERE id = ?', [itemId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!currentItem) {
            return res.status(404).json({ error: 'Item not found' });
        }
        
        const newState = currentItem.completed === 1 ? 0 : 1;

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE checklist_items 
                SET completed = ?,
                    completed_at = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE NULL END
                WHERE id = ?
            `, [newState, newState, itemId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        console.log(`[API] Item ${itemId} toggled to ${newState === 1 ? 'completed' : 'pending'}`);
        res.json({ 
            success: true, 
            message: 'Item toggled',
            id: itemId,
            completed: newState === 1
        });
    } catch (error) {
        console.error('API Toggle Error:', error);
        res.status(500).json({ error: 'Error toggling item' });
    }
});

// POST transcribe lyrics from audio
router.post('/tracks/:id/transcribe', async (req, res) => {
    try {
        const db = getDatabase();
        const trackId = req.params.id;
        
        console.log(`[API] Transcribing lyrics for track ${trackId}`);

        // Get track info
        const track = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM tracks WHERE id = ?', [trackId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
        
        if (!track) {
            return res.status(404).json({ error: 'Track not found' });
        }
        
        if (!track.audio_file_path) {
            return res.status(400).json({ error: 'No audio file available for transcription' });
        }

        // TODO: Integrate with OpenAI Whisper API or similar service
        // For now, return a placeholder message
        const mockTranscription = `[Transcripción pendiente - Requiere integración con servicio de IA]

Para transcribir automáticamente la letra desde el audio, necesitas:

1. Integrar con OpenAI Whisper API
2. O usar AWS Transcribe
3. O Google Cloud Speech-to-Text

Audio disponible en:
${track.audio_file_path}

Track: ${track.title}
Productor: ${track.producer_id || 'No asignado'}

[La transcripción automática de letras de canciones requiere procesamiento de audio avanzado]`;

        // In production, you would:
        // 1. Read the audio file from Dropbox or local path
        // 2. Send to transcription service (Whisper API)
        // 3. Get the lyrics text
        // 4. Update the database
        // 5. Return the transcribed lyrics

        res.json({ 
            success: true, 
            message: 'Transcription service ready (requires AI integration)',
            lyrics: mockTranscription,
            audioPath: track.audio_file_path,
            trackTitle: track.title,
            note: 'Integrate with OpenAI Whisper API for automatic transcription'
        });
    } catch (error) {
        console.error('API Transcribe Error:', error);
        res.status(500).json({ error: 'Error transcribing track' });
    }
});

module.exports = router;