const express = require('express');
const router = express.Router();
const { getAll, getOne, run } = require('../config/database');

// Middleware to check if user is admin
function requireAdmin(req, res, next) {
    if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'super_admin')) {
        return res.status(403).render('error', { 
            title: 'Acceso Denegado',
            error: 'No tienes permisos para acceder a esta sección' 
        });
    }
    next();
}

// GET settings main page
router.get('/', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        // Get system settings
        const settings = await getAll('SELECT * FROM system_settings');
        const settingsObj = {};
        settings.forEach(s => settingsObj[s.setting_key] = s.setting_value);
        
        res.render('settings/index', {
            title: 'Configuraciones',
            settings: settingsObj,
            user: req.session.user
        });
    } catch (error) {
        console.error('Settings error:', error);
        res.render('error', { title: 'Error', error: error.message });
    }
});

// POST update settings
router.post('/', requireAdmin, async (req, res) => {
    try {
        const { max_file_size, max_files_per_upload, allowed_formats, auto_transcribe } = req.body;
        
        // Update each setting
        const updates = [
            { key: 'max_file_size', value: max_file_size || '100' },
            { key: 'max_files_per_upload', value: max_files_per_upload || '25' },
            { key: 'allowed_formats', value: allowed_formats || 'wav,mp3,m4a,flac,aac' },
            { key: 'auto_transcribe', value: auto_transcribe ? '1' : '0' }
        ];
        
        for (const setting of updates) {
            await run(
                'INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
                [setting.key, setting.value, setting.value]
            );
        }
        
        res.json({ success: true, message: 'Configuración guardada' });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET users list
router.get('/users', requireAdmin, async (req, res) => {
    try {
        const users = await getAll(`
            SELECT u.*, c.name as company_name 
            FROM users u 
            LEFT JOIN companies c ON u.company_id = c.id 
            ORDER BY u.created_at DESC
        `);
        
        res.render('settings/users', {
            title: 'Gestión de Usuarios',
            users: users
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

// GET companies list
router.get('/companies', requireAdmin, async (req, res) => {
    try {
        const companies = await getAll('SELECT * FROM companies ORDER BY created_at DESC');
        res.render('settings/companies', {
            title: 'Empresas / Disqueras',
            companies: companies
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

// POST create company
router.post('/companies', requireAdmin, async (req, res) => {
    try {
        const { name, email, phone, subscription_type } = req.body;
        
        const result = await run(
            'INSERT INTO companies (name, email, phone, subscription_type, status) VALUES (?, ?, ?, ?, "active")',
            [name, email, phone, subscription_type || 'basic']
        );
        
        res.json({ 
            success: true, 
            message: 'Empresa creada exitosamente',
            companyId: result.lastID || result.insertId
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET bulk upload settings
router.get('/bulk-upload', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        const settings = await getAll('SELECT * FROM system_settings WHERE setting_key LIKE "bulk_%" OR setting_key IN ("max_file_size", "max_files_per_upload", "allowed_formats")');
        const settingsObj = {};
        settings.forEach(s => settingsObj[s.setting_key] = s.setting_value);
        
        res.render('settings/bulk-upload', {
            title: 'Configuración de Subida en Lote',
            settings: settingsObj
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

// DELETE user
router.delete('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        
        // Don't allow deleting yourself
        if (parseInt(userId) === req.session.user.id) {
            return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta' });
        }
        
        await run('DELETE FROM users WHERE id = ?', [userId]);
        res.json({ success: true, message: 'Usuario eliminado' });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET edit user form
router.get('/users/:id/edit', requireAdmin, async (req, res) => {
    try {
        const user = await getOne('SELECT * FROM users WHERE id = ?', [req.params.id]);
        if (!user) {
            return res.render('error', { title: 'Error', error: 'Usuario no encontrado' });
        }
        
        const companies = await getAll('SELECT id, name FROM companies WHERE status = "active"');
        res.render('settings/edit-user', {
            title: 'Editar Usuario',
            user: user,
            companies: companies
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

// PUT update user
router.put('/users/:id', requireAdmin, async (req, res) => {
    try {
        const userId = req.params.id;
        const { name, email, username, role, company_id, status } = req.body;
        
        await run(
            'UPDATE users SET name = ?, email = ?, username = ?, role = ?, company_id = ?, status = ? WHERE id = ?',
            [name, email, username, role, company_id || null, status, userId]
        );
        
        res.json({ success: true, message: 'Usuario actualizado' });
    } catch (error) {
        console.error('Update user error:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET edit company form
router.get('/companies/:id/edit', requireAdmin, async (req, res) => {
    try {
        const company = await getOne('SELECT * FROM companies WHERE id = ?', [req.params.id]);
        if (!company) {
            return res.render('error', { title: 'Error', error: 'Empresa no encontrada' });
        }
        
        res.render('settings/edit-company', {
            title: 'Editar Empresa',
            company: company
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

// PUT update company
router.put('/companies/:id', requireAdmin, async (req, res) => {
    try {
        const companyId = req.params.id;
        const { name, email, phone, subscription_type, status } = req.body;
        
        await run(
            'UPDATE companies SET name = ?, email = ?, phone = ?, subscription_type = ?, status = ? WHERE id = ?',
            [name, email, phone, subscription_type, status, companyId]
        );
        
        res.json({ success: true, message: 'Empresa actualizada' });
    } catch (error) {
        console.error('Update company error:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE company
router.delete('/companies/:id', requireAdmin, async (req, res) => {
    try {
        await run('DELETE FROM companies WHERE id = ?', [req.params.id]);
        res.json({ success: true, message: 'Empresa eliminada' });
    } catch (error) {
        console.error('Delete company error:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
