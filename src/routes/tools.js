const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    res.render('tools/index', {
        title: 'Herramientas - El Inmortal 2 Dashboard'
    });
});

router.get('/thumbnail-generator', (req, res) => {
    res.render('tools/thumbnail-generator', {
        title: 'Thumbnail Generator - El Inmortal 2 Dashboard'
    });
});

module.exports = router;
