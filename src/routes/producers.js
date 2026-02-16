const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getAll, getOne, run } = require('../config/database');

// GET all producers
router.get('/', async (req, res) => {
    try {
        const producers = await getAll(`
            SELECT p.*, COUNT(t.id) as track_count
            FROM producers p
            LEFT JOIN tracks t ON p.id = t.producer_id
            GROUP BY p.id
            ORDER BY p.name
        `);

        res.render('producers/index', {
            title: 'Productores - El Inmortal 2',
            producers: producers || []
        });
    } catch (error) {
        console.error('Error fetching producers:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando productores',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET new producer form
router.get('/new', (req, res) => {
    res.render('producers/new', {
        title: 'Nuevo Productor - El Inmortal 2'
    });
});

// POST create producer
router.post('/', [
    body('name').trim().notEmpty(),
    body('email').isEmail(),
    body('split_percentage').optional().trim()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).render('producers/new', {
            title: 'Nuevo Productor',
            errors: errors.array(),
            formData: req.body
        });
    }

    try {
        const { name, legal_name, email, phone, address, split_percentage } = req.body;

        await run(
            `INSERT INTO producers (name, legal_name, email, phone, address, split_percentage)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [name, legal_name, email, phone, address, split_percentage || '50/50']
        );

        res.redirect('/producers');
    } catch (error) {
        console.error('Error creating producer:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error creando productor',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET producer details with their tracks
router.get('/:id', async (req, res) => {
    try {
        const producerId = req.params.id;

        const producer = await getOne('SELECT * FROM producers WHERE id = ?', [producerId]);

        if (!producer) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Productor no encontrado',
                error: {}
            });
        }

        const tracks = await getAll(`
            SELECT t.*, s.status as splitsheet_status
            FROM tracks t
            LEFT JOIN splitsheets s ON t.id = s.track_id AND s.producer_id = ?
            WHERE t.producer_id = ?
            ORDER BY t.track_number
        `, [producerId, producerId]);

        res.render('producers/show', {
            title: `Productor: ${producer.name}`,
            producer: producer,
            tracks: tracks || []
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error cargando productor',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// GET edit form
router.get('/:id/edit', async (req, res) => {
    try {
        const producerId = req.params.id;

        const producer = await getOne('SELECT * FROM producers WHERE id = ?', [producerId]);

        if (!producer) {
            return res.status(404).render('error', {
                title: '404',
                message: 'Productor no encontrado',
                error: {}
            });
        }

        res.render('producers/edit', {
            title: `Editar: ${producer.name}`,
            producer: producer
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

// PUT update producer
router.put('/:id', async (req, res) => {
    try {
        const producerId = req.params.id;
        const { name, legal_name, email, phone, address, split_percentage, status } = req.body;

        await run(
            `UPDATE producers 
             SET name = ?, legal_name = ?, email = ?, phone = ?, 
                 address = ?, split_percentage = ?, status = ?
             WHERE id = ?`,
            [name, legal_name, email, phone, address, split_percentage, status, producerId]
        );

        res.redirect('/producers');
    } catch (error) {
        console.error('Error updating producer:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'Error actualizando productor',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// DELETE producer
router.delete('/:id', async (req, res) => {
    try {
        const producerId = req.params.id;

        await run('DELETE FROM producers WHERE id = ?', [producerId]);

        res.json({ success: true, message: 'Productor eliminado' });
    } catch (error) {
        console.error('Error deleting producer:', error);
        res.status(500).json({ success: false, message: 'Error eliminando productor' });
    }
});

module.exports = router;
