const express = require('express');
const router = express.Router();

function isAllowedHost(hostname, allowedHosts) {
    return allowedHosts.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

function normalizeDropboxUrl(rawUrl) {
    const parsed = new URL(rawUrl);

    if (parsed.hostname === 'www.dropbox.com') {
        parsed.hostname = 'dl.dropboxusercontent.com';
    }

    if (parsed.hostname.includes('dropbox')) {
        parsed.searchParams.set('dl', '1');
    }

    return parsed.toString();
}

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

router.get('/proxy/video', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) {
            return res.status(400).json({ error: 'url is required' });
        }

        const parsed = new URL(rawUrl);
        const allowedHosts = ['dropbox.com', 'dropboxusercontent.com'];
        if (!isAllowedHost(parsed.hostname, allowedHosts)) {
            return res.status(400).json({ error: 'Only Dropbox URLs are allowed for video proxy' });
        }

        const targetUrl = normalizeDropboxUrl(rawUrl);
        const response = await fetch(targetUrl);
        if (!response.ok) {
            return res.status(502).json({ error: `Could not fetch remote video (${response.status})` });
        }

        const contentType = response.headers.get('content-type') || 'video/mp4';
        const bytes = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(bytes);
    } catch (error) {
        console.error('Video proxy error:', error);
        return res.status(500).json({ error: 'Error proxying video' });
    }
});

router.get('/proxy/image', async (req, res) => {
    try {
        const rawUrl = req.query.url;
        if (!rawUrl) {
            return res.status(400).json({ error: 'url is required' });
        }

        const parsed = new URL(rawUrl);
        const allowedHosts = ['ytimg.com', 'img.youtube.com', 'dropbox.com', 'dropboxusercontent.com'];
        if (!isAllowedHost(parsed.hostname, allowedHosts)) {
            return res.status(400).json({ error: 'Host not allowed for image proxy' });
        }

        const targetUrl = parsed.hostname.includes('dropbox') ? normalizeDropboxUrl(rawUrl) : rawUrl;
        const response = await fetch(targetUrl);
        if (!response.ok) {
            return res.status(502).json({ error: `Could not fetch remote image (${response.status})` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        const bytes = Buffer.from(await response.arrayBuffer());
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'no-store');
        return res.send(bytes);
    } catch (error) {
        console.error('Image proxy error:', error);
        return res.status(500).json({ error: 'Error proxying image' });
    }
});

module.exports = router;
