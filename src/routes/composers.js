const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getAll, getOne, run } = require('../config/database');

// GET all composers
router.get('/', async (req, res) => {
    try {
        const composers = await getAll(`
            SELECT c.*, COUNT(tc.id) as track_count
            FROM composers c
            LEFT JOIN track_composers tc ON c.id = tc.composer_id
            GROUP BY c.id
            ORDER BY c.name
        `);

        res.render('composers/index', {
            title: 'Compositores - El Inmortal 2',
            composers: composers || []
        });
    } catch (error) {
        console.error('Error fetching composers:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando compositores',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET new composer form
router.get('/new', (req, res) => {
    res.render('composers/new', {
        title: 'Nuevo Compositor - El Inmortal 2'
    });
});

// POST create composer
router.post('/', [
    body('name').trim().notEmpty(),
    body('email').optional().isEmail()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('composers/new', {
            title: 'Nuevo Compositor',
            errors: errors.array(),
            formData: req.body
        });
    }

    try {
        const { name, email, phone } = req.body;

        await run(
            `INSERT INTO composers (name, email, phone) VALUES (?, ?, ?)`,
            [name, email, phone]
        );

        res.redirect('/composers');
    } catch (error) {
        console.error('Error creating composer:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error creando compositor',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET edit form
router.get('/:id/edit', async (req, res) => {
    try {
        const composerId = req.params.id;

        const composer = await getOne('SELECT * FROM composers WHERE id = ?', [composerId]);

        if (!composer) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Compositor no encontrado',
                error: {}
            });
        }

        res.render('composers/edit', {
            title: `Editar: ${composer.name}`,
            composer: composer
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando formulario',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// PUT update composer
router.put('/:id', async (req, res) => {
    try {
        const composerId = req.params.id;
        const { name, email, phone } = req.body;

        await run(
            `UPDATE composers 
             SET name = ?, email = ?, phone = ?
             WHERE id = ?`,
            [name, email, phone, composerId]
        );

        res.redirect('/composers');
    } catch (error) {
        console.error('Error updating composer:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando compositor',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// DELETE composer
router.delete('/:id', async (req, res) => {
    try {
        const composerId = req.params.id;

        await run('DELETE FROM composers WHERE id = ?', [composerId]);

        res.json({ success: true, message: 'Compositor eliminado' });
    } catch (error) {
        console.error('Error deleting composer:', error);
        res.status(500).json({ success: false, message: 'Error eliminando compositor' });
    }
});

module.exports = router;
