const express = require('express');
const router = express.Router();
const { getAll } = require('../config/database');

// GET checklist
router.get('/', async (req, res) => {
    try {
        const items = await getAll(`
            SELECT * FROM checklist_items
            ORDER BY 
                CASE priority 
                    WHEN 'urgent' THEN 1 
                    WHEN 'high' THEN 2 
                    WHEN 'normal' THEN 3 
                    ELSE 4 
                END,
                created_at DESC
        `);

        // Group by category
        const grouped = {};
        (items || []).forEach(item => {
            if (!grouped[item.category]) {
                grouped[item.category] = [];
            }
            grouped[item.category].push(item);
        });

        res.render('checklist/index', {
            title: 'Checklist de Lanzamiento - El Inmortal 2',
            checklist: grouped
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando checklist',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

module.exports = router;
