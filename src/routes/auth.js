const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDatabase } = require('../config/database');

// GET login page
router.get('/login', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', {
        title: 'Login - El Inmortal 2',
        error: null
    });
});

// POST login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    // Simple auth for demo - in production use proper user management
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
    
    if (username === adminUser && password === adminPass) {
        req.session.user = { username: adminUser };
        res.redirect('/');
    } else {
        res.render('auth/login', {
            title: 'Login - El Inmortal 2',
            error: 'Usuario o contraseña incorrectos'
        });
    }
});

// GET logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/auth/login');
});

module.exports = router;