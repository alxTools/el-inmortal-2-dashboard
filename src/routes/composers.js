const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { getDatabase } = require('../config/database');

// GET all composers
router.get('/', async (req, res) => {
    try {
        const db = getDatabase();
        
        const composers = await new Promise((resolve, reject) => {
            db.all(`
                SELECT c.*, COUNT(tc.id) as track_count
                FROM composers c
                LEFT JOIN track_composers tc ON c.id = tc.composer_id
                GROUP BY c.id
                ORDER BY c.name
            `, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

        res.render('composers/index', {
            title: 'Compositores - El Inmortal 2',
            composers: composers
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
        const db = getDatabase();
        const { 
            name, legal_name, email, phone, publisher, 
            PRO_affiliation, IPI_number, split_percentage, notes 
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                INSERT INTO composers (name, legal_name, email, phone, publisher, PRO_affiliation, IPI_number, split_percentage, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [name, legal_name, email, phone, publisher, PRO_affiliation, IPI_number, split_percentage || '50/50', notes], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });

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
        const db = getDatabase();
        const composerId = req.params.id;

        const composer = await new Promise((resolve, reject) => {
            db.get('SELECT * FROM composers WHERE id = ?', [composerId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

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
        const db = getDatabase();
        const composerId = req.params.id;
        const { 
            name, legal_name, email, phone, publisher,
            PRO_affiliation, IPI_number, split_percentage, notes, status 
        } = req.body;

        await new Promise((resolve, reject) => {
            db.run(`
                UPDATE composers 
                SET name = ?, legal_name = ?, email = ?, phone = ?, publisher = ?,
                    PRO_affiliation = ?, IPI_number = ?, split_percentage = ?, notes = ?, status = ?
                WHERE id = ?
            `, [name, legal_name, email, phone, publisher, PRO_affiliation, IPI_number, split_percentage, notes, status, composerId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

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
        const db = getDatabase();
        const composerId = req.params.id;

        await new Promise((resolve, reject) => {
            db.run('DELETE FROM composers WHERE id = ?', [composerId], (err) => {
                if (err) reject(err);
                else resolve();
            });
        });

        res.json({ success: true, message: 'Compositor eliminado' });
    } catch (error) {
        console.error('Error deleting composer:', error);
        res.status(500).json({ success: false, message: 'Error eliminando compositor' });
    }
});

module.exports = router;