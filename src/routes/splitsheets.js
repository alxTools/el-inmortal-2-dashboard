const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');
const nodemailer = require('nodemailer');

function toPercentage(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return null;
    const rounded = Math.round(parsed);
    if (rounded < 0 || rounded > 100) return null;
    return rounded;
}

async function getSplitsheetById(splitsheetId) {
    return await getOne(
        `SELECT
            s.*,
            t.title AS track_title,
            t.track_number,
            p.name AS producer_name,
            p.email AS producer_email
         FROM splitsheets s
         JOIN tracks t ON s.track_id = t.id
         JOIN producers p ON s.producer_id = p.id
         WHERE s.id = ?`,
        [splitsheetId]
    );
}

async function syncTrackSplitsheetFlags(trackId) {
    const summary = await getOne(
        `SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed
         FROM splitsheets
         WHERE track_id = ?`,
        [trackId]
    );

    const total = Number(summary?.total || 0);
    const confirmed = Number(summary?.confirmed || 0);

    const splitsheetSent = total > 0 ? 1 : 0;
    const splitsheetConfirmed = total > 0 && confirmed === total ? 1 : 0;

    await run(
        'UPDATE tracks SET splitsheet_sent = ?, splitsheet_confirmed = ? WHERE id = ?',
        [splitsheetSent, splitsheetConfirmed, trackId]
    );
}

// GET splitsheets dashboard
router.get('/', async (req, res) => {
    try {
        const splitsheets = await getAll(`
            SELECT s.*, t.title as track_title, t.track_number, p.name as producer_name, p.email as producer_email
            FROM splitsheets s
            JOIN tracks t ON s.track_id = t.id
            JOIN producers p ON s.producer_id = p.id
            ORDER BY s.created_at DESC
        `);

        res.render('splitsheets/index', {
            title: 'Splitsheets - El Inmortal 2',
            splitsheets: splitsheets || []
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
        const trackId = req.params.trackId;

        const track = await getOne(`
            SELECT t.*, p.name as producer_name, p.legal_name as producer_legal_name, 
                   p.email as producer_email, p.split_percentage
            FROM tracks t
            JOIN producers p ON t.producer_id = p.id
            WHERE t.id = ?
        `, [trackId]);

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

// GET edit a splitsheet
router.get('/:id/edit', async (req, res) => {
    try {
        const splitsheet = await getSplitsheetById(req.params.id);

        if (!splitsheet) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Splitsheet no encontrado',
                error: {}
            });
        }

        return res.render('splitsheets/edit', {
            title: `Editar Splitsheet - ${splitsheet.track_title}`,
            splitsheet,
            validationError: ''
        });
    } catch (error) {
        console.error('Error loading splitsheet edit form:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// PUT update splitsheet percentages and status
router.put('/:id', async (req, res) => {
    try {
        const splitsheetId = req.params.id;
        const existing = await getSplitsheetById(splitsheetId);

        if (!existing) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Splitsheet no encontrado',
                error: {}
            });
        }

        const artistPercentage = toPercentage(req.body.artist_percentage);
        const producerPercentage = toPercentage(req.body.producer_percentage);
        const status = String(req.body.status || 'pending').trim();
        const notes = String(req.body.notes || '').trim();

        const allowedStatuses = new Set(['pending', 'sent', 'confirmed']);

        let validationError = '';
        if (artistPercentage === null || producerPercentage === null) {
            validationError = 'Los porcentajes deben estar entre 0 y 100.';
        } else if ((artistPercentage + producerPercentage) !== 100) {
            validationError = 'La suma de Artista + Productor debe ser 100%.';
        } else if (!allowedStatuses.has(status)) {
            validationError = 'Estado inválido.';
        }

        if (validationError) {
            return res.status(422).render('splitsheets/edit', {
                title: `Editar Splitsheet - ${existing.track_title}`,
                splitsheet: {
                    ...existing,
                    artist_percentage: req.body.artist_percentage,
                    producer_percentage: req.body.producer_percentage,
                    status,
                    notes
                },
                validationError
            });
        }

        await run(
            `UPDATE splitsheets
             SET artist_percentage = ?,
                 producer_percentage = ?,
                 status = ?,
                 notes = ?
             WHERE id = ?`,
            [artistPercentage, producerPercentage, status, notes || null, splitsheetId]
        );

        await syncTrackSplitsheetFlags(existing.track_id);

        return res.redirect('/splitsheets');
    } catch (error) {
        console.error('Error updating splitsheet:', error);
        return res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando splitsheet',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// POST send splitsheet via email
router.post('/:trackId/send', async (req, res) => {
    try {
        const trackId = req.params.trackId;
        const { producerEmail, artistEmail, message } = req.body;
        
        // Get track and producer info
        const track = await getOne(`
            SELECT t.*, p.name as producer_name, p.email as producer_db_email
            FROM tracks t
            JOIN producers p ON t.producer_id = p.id
            WHERE t.id = ?
        `, [trackId]);
        
        if (!track) {
            return res.status(404).json({ error: 'Track no encontrado' });
        }
        
        // Use provided emails or fallbacks
        const toProducer = producerEmail || track.producer_db_email;
        const toArtist = artistEmail || 'galante@el-emperador.com';
        
        if (!toProducer) {
            return res.status(400).json({ error: 'Email del productor no disponible' });
        }
        
        // Create email transporter (configure with your SMTP settings)
        const transporter = nodemailer.createTransporter({
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: process.env.SMTP_PORT || 587,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        
        const splitsheetUrl = `${process.env.APP_URL || 'https://dash.galanteelemperador.com'}/splitsheets/generate/${trackId}`;
        
        const emailContent = `
            <h2>Splitsheet Agreement - ${track.title}</h2>
            <p><strong>Tema:</strong> ${track.title}</p>
            <p><strong>Artista:</strong> Galante el Emperador</p>
            <p><strong>Productor:</strong> ${track.producer_name}</p>
            <p><strong>División:</strong> ${track.split_percentage || '50/50'}</p>
            
            ${message ? `<p><strong>Mensaje:</strong><br>${message}</p>` : ''}
            
            <p>Ver splitsheet completo: <a href="${splitsheetUrl}">${splitsheetUrl}</a></p>
            
            <hr>
            <p style="font-size: 0.9em; color: #666;">Este es un email automático de El Inmortal 2 Dashboard.</p>
        `;
        
        // Send emails
        const emailPromises = [];
        
        // Email to producer
        emailPromises.push(transporter.sendMail({
            from: '"El Inmortal 2" <splits@galanteelemperador.com>',
            to: toProducer,
            subject: `Splitsheet - ${track.title}`,
            html: emailContent
        }));
        
        // Email to artist (CC)
        emailPromises.push(transporter.sendMail({
            from: '"El Inmortal 2" <splits@galanteelemperador.com>',
            to: toArtist,
            subject: `Copia: Splitsheet - ${track.title}`,
            html: emailContent
        }));
        
        await Promise.all(emailPromises);
        
        // Update splitsheet status
        await run(`
            UPDATE splitsheets 
            SET status = 'sent', sent_date = CURRENT_TIMESTAMP 
            WHERE track_id = ?
        `, [trackId]);
        
        res.json({ 
            success: true, 
            message: 'Emails enviados exitosamente' 
        });
        
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            error: 'Error enviando emails',
            details: error.message 
        });
    }
});

module.exports = router;
