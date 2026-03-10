const express = require('express');
const router = express.Router();

// GET calendar
router.get('/', async (req, res) => {
    try {
        res.render('calendar/index', {
            title: 'Calendario de Contenido - El Inmortal 2'
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
