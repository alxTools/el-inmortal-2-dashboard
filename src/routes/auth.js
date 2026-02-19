const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getOne, run, getAll } = require('../config/database');

// GET login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', {
        title: 'Login - Galante Dashboard',
        error: null
    });
});

// POST login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    try {
        let user;
        if (email.includes('@')) {
            user = await getOne('SELECT * FROM users WHERE email = ? AND status = "active"', [email]);
        } else {
            user = await getOne('SELECT * FROM users WHERE username = ? AND status = "active"', [email]);
        }
        
        if (!user) {
            return res.render('auth/login', {
                title: 'Login - Galante Dashboard',
                error: 'Usuario no encontrado o inactivo'
            });
        }
        
        let isValid = false;
        if (user.password_hash && user.password_hash !== null && user.password_hash !== '') {
            isValid = await bcrypt.compare(password, user.password_hash);
        } else if (user.password === password) {
            isValid = true;
        }
        
        if (!isValid) {
            return res.render('auth/login', {
                title: 'Login - Galante Dashboard',
                error: 'Contraseña incorrecta'
            });
        }
        
        req.session.user = {
            id: user.id,
            email: user.email,
            name: user.name || user.username,
            role: user.role || 'artist',
            company_id: user.company_id
        };

        await run('UPDATE users SET last_login = NOW() WHERE id = ?', [user.id]);

        req.session.save((sessionErr) => {
            if (sessionErr) {
                console.error('Session save error:', sessionErr);
                return res.render('auth/login', {
                    title: 'Login - Galante Dashboard',
                    error: 'No se pudo mantener la sesión activa. Intenta de nuevo.'
                });
            }

            return res.redirect('/');
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', {
            title: 'Login - Galante Dashboard',
            error: 'Error en el sistema'
        });
    }
});

// GET register page (PUBLIC - for new users)
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/register', {
        title: 'Registro - Galante Dashboard',
        error: null,
        success: null
    });
});

// POST register (PUBLIC - for new users)
router.post('/register', async (req, res) => {
    const { name, email, password, username } = req.body;
    
    try {
        // Validaciones básicas
        if (!name || !email || !password || !username) {
            return res.render('auth/register', {
                title: 'Registro - Galante Dashboard',
                error: 'Todos los campos son requeridos',
                success: null
            });
        }
        
        if (password.length < 6) {
            return res.render('auth/register', {
                title: 'Registro - Galante Dashboard',
                error: 'La contraseña debe tener al menos 6 caracteres',
                success: null
            });
        }
        
        // Verificar si email ya existe
        const existingEmail = await getOne('SELECT id FROM users WHERE email = ?', [email]);
        if (existingEmail) {
            return res.render('auth/register', {
                title: 'Registro - Galante Dashboard',
                error: 'Este email ya está registrado',
                success: null
            });
        }
        
        // Verificar si username ya existe
        const existingUser = await getOne('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUser) {
            return res.render('auth/register', {
                title: 'Registro - Galante Dashboard',
                error: 'Este nombre de usuario ya está en uso',
                success: null
            });
        }
        
        // Hash de contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Crear usuario con rol 'artist' por defecto
        const result = await run(
            'INSERT INTO users (name, email, username, password, password_hash, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())',
            [name, email, username, password, passwordHash, 'artist', 'active']
        );
        
        console.log('Nuevo usuario registrado:', username, 'ID:', result.lastID || result.insertId);
        
        res.render('auth/register', {
            title: 'Registro - Galante Dashboard',
            error: null,
            success: '¡Cuenta creada exitosamente! Ya puedes iniciar sesión.'
        });
        
    } catch (error) {
        console.error('Register error:', error);
        res.render('auth/register', {
            title: 'Registro - Galante Dashboard',
            error: 'Error al crear la cuenta: ' + error.message,
            success: null
        });
    }
});

// GET admin register page (only for admin/super_admin - for creating other users)
router.get('/admin/register', async (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'super_admin')) {
        return res.redirect('/');
    }
    
    try {
        const companies = await getAll('SELECT id, name FROM companies WHERE status = "active"');
        res.render('auth/admin-register', {
            title: 'Registrar Usuario (Admin)',
            companies: companies,
            error: null
        });
    } catch (error) {
        res.render('auth/admin-register', {
            title: 'Registrar Usuario (Admin)',
            companies: [],
            error: error.message
        });
    }
});

// POST admin register
router.post('/admin/register', async (req, res) => {
    if (!req.session.user || (req.session.user.role !== 'admin' && req.session.user.role !== 'super_admin')) {
        return res.redirect('/');
    }
    
    const { name, email, password, role, company_id, username } = req.body;
    
    try {
        // Check if email exists
        const existing = await getOne('SELECT id FROM users WHERE email = ?', [email]);
        
        if (existing) {
            const companies = await getAll('SELECT id, name FROM companies WHERE status = "active"');
            return res.render('auth/admin-register', {
                title: 'Registrar Usuario (Admin)',
                companies: companies,
                error: 'El email ya está registrado'
            });
        }
        
        // Check if username exists
        const existingUser = await getOne('SELECT id FROM users WHERE username = ?', [username]);
        if (existingUser) {
            const companies = await getAll('SELECT id, name FROM companies WHERE status = "active"');
            return res.render('auth/admin-register', {
                title: 'Registrar Usuario (Admin)',
                companies: companies,
                error: 'El nombre de usuario ya está en uso'
            });
        }
        
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);
        
        // Add user
        await run(
            'INSERT INTO users (name, email, username, password, password_hash, role, company_id, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [name, email, username, password, passwordHash, role, company_id || null, 'active']
        );
        
        res.redirect('/settings/users');
        
    } catch (error) {
        console.error('Admin register error:', error);
        const companies = await getAll('SELECT id, name FROM companies WHERE status = "active"');
        res.render('auth/admin-register', {
            title: 'Registrar Usuario (Admin)',
            companies: companies,
            error: error.message
        });
    }
});

// GET logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

// GET profile page
router.get('/profile', async (req, res) => {
    if (!req.session.user) {
        return res.redirect('/auth/login');
    }
    
    try {
        const user = await getOne('SELECT id, name, email, username, role, company_id, created_at FROM users WHERE id = ?', [req.session.user.id]);
        res.render('auth/profile', {
            title: 'Mi Perfil',
            user: user
        });
    } catch (error) {
        res.render('error', { title: 'Error', error: error.message });
    }
});

module.exports = router;
