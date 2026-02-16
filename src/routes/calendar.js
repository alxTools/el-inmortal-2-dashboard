const express = require('express');
const router = express.Router();
const { getAll } = require('../config/database');

// GET calendar
router.get('/', async (req, res) => {
    try {
        const events = await getAll(`
            SELECT c.*, t.title as track_title
            FROM content_calendar c
            LEFT JOIN tracks t ON c.track_id = t.id
            ORDER BY c.date, c.id
        `);

        res.render('calendar/index', {
            title: 'Calendario de Contenido - El Inmortal 2',
            events: events || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando calendario',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

module.exports = router;
