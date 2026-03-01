const express = require('express');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const router = express.Router();
const ytdl = require('youtube-dl-exec');
const multer = require('multer');
const execAsync = promisify(exec);
const proxyGeneratedRoot = path.join(__dirname, '../../scripts/proxy/generated');

const {
    ensureYoutubeMetadataTables,
    inspectYoutubeChannelAndStore,
    getYoutubeAuditDashboardData,
    applyYoutubeAuditUpdates,
    optimizeTopTrafficVideosAndStoreTargets,
    optimizeTopTrafficAndApplyUpdates,
    generateAndStoreYoutubeOpsDailyReport,
    sendYoutubeOpsDailyReportEmail
} = require('../utils/youtubeMetadataAudit');

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

function safeReadJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (_) {
        return null;
    }
}

function getProxyPoolSnapshot(poolName) {
    const poolDir = path.join(proxyGeneratedRoot, poolName);
    const latestPath = path.join(poolDir, 'proxy-check-latest.json');
    const payload = safeReadJson(latestPath);

    if (!payload || !Array.isArray(payload.results)) {
        return null;
    }

    const items = payload.results.map((item) => ({
        name: item.name,
        host: item.host,
        port: item.port,
        proxyUser: item.proxy_user,
        proxyPass: item.proxy_pass,
        vpnIp: item.vpn_ip,
        ready: Boolean(item.ready),
        city: item.city || '',
        cc: item.cc || '',
        serverName: item.server_name || '',
        dockerHealth: item.docker_health || '',
        error: item.error || ''
    }));

    const readyCount = items.filter((x) => x.ready).length;

    return {
        pool: poolName,
        checkedAtUtc: payload.checked_at_utc || null,
        total: items.length,
        ready: readyCount,
        down: items.length - readyCount,
        items
    };
}

function listAvailableProxyPools() {
    if (!fs.existsSync(proxyGeneratedRoot)) {
        return [];
    }

    const entries = fs.readdirSync(proxyGeneratedRoot, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .filter((name) => fs.existsSync(path.join(proxyGeneratedRoot, name, 'proxy-check-latest.json')))
        .sort();
}

// Configure multer for video uploads
const uploadDir = path.join(__dirname, '../../temp');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const videoUpload = multer({
    dest: uploadDir,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/mpeg'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no soportado. Use MP4, MOV, WebM, AVI o MPEG.'), false);
        }
    }
});

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

router.get('/exports', async (req, res) => {
    const exportDir = path.join(__dirname, '../../exports');
    let exportsList = [];

    try {
        if (fs.existsSync(exportDir)) {
            const entries = fs.readdirSync(exportDir, { withFileTypes: true });
            exportsList = entries
                .filter((entry) => entry.isFile())
                .map((entry) => {
                    const fullPath = path.join(exportDir, entry.name);
                    const stat = fs.statSync(fullPath);
                    return {
                        name: entry.name,
                        size: stat.size,
                        updatedAt: stat.mtime
                    };
                })
                .sort((a, b) => b.updatedAt - a.updatedAt);
        }
    } catch (error) {
        console.error('Exports list error:', error);
    }

    res.render('tools/exports', {
        title: 'Exports - El Inmortal 2 Dashboard',
        exportsList
    });
});

router.get('/exports/download/:filename', (req, res) => {
    const exportDir = path.join(__dirname, '../../exports');
    const rawName = String(req.params.filename || '').trim();
    const safeName = path.basename(rawName);
    const filePath = path.join(exportDir, safeName);

    if (!safeName || !fs.existsSync(filePath)) {
        return res.status(404).send('Archivo no encontrado');
    }

    return res.download(filePath, safeName);
});

router.get('/youtube-metadata-audit', async (req, res) => {
    let dashboard = { hasData: false, run: null, items: [] };
    let errorMessage = '';
    const runId = Number(req.query.runId || 0) || null;

    try {
        await ensureYoutubeMetadataTables();
        dashboard = await getYoutubeAuditDashboardData(runId, 400);
    } catch (error) {
        console.error('YouTube audit page error:', error);
        errorMessage = error.message || 'No se pudo cargar la herramienta.';
    }

    res.render('tools/youtube-metadata-audit', {
        title: 'YouTube Metadata Audit - El Inmortal 2 Dashboard',
        dashboard,
        flash: String(req.query.flash || ''),
        errorMessage
    });
});

router.post('/youtube-metadata-audit/inspect', async (req, res) => {
    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const result = await inspectYoutubeChannelAndStore({ requestedBy });
        return res.redirect(`/tools/youtube-metadata-audit?runId=${result.run.id}&flash=inspect_ok`);
    } catch (error) {
        console.error('YouTube inspect error:', error);
        return res.redirect(`/tools/youtube-metadata-audit?flash=${encodeURIComponent(`inspect_error:${error.message}`)}`);
    }
});

router.post('/youtube-metadata-audit/optimize-top', async (req, res) => {
    const runId = Number(req.body.run_id || 0) || null;
    const limit = Math.max(1, Math.min(200, Number(req.body.limit || 50) || 50));
    const onlyNeedsFix = String(req.body.only_needs_fix || 'on') !== 'off';

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const result = await optimizeTopTrafficVideosAndStoreTargets({
            runId,
            limit,
            requestedBy,
            onlyNeedsFix
        });

        const effectiveRunId = runId || result.auditRunId;
        const flash = `optimize_ok:processed:${result.processed}|optimized:${result.optimized}|failed:${result.failed}|seo_run:${result.seoRunId}`;
        return res.redirect(`/tools/youtube-metadata-audit?runId=${effectiveRunId}&flash=${encodeURIComponent(flash)}`);
    } catch (error) {
        console.error('YouTube top SEO optimization error:', error);
        const fallbackRunId = runId ? `runId=${runId}&` : '';
        return res.redirect(`/tools/youtube-metadata-audit?${fallbackRunId}flash=${encodeURIComponent(`optimize_error:${error.message}`)}`);
    }
});

router.post('/youtube-metadata-audit/optimize-top-and-update', async (req, res) => {
    const runId = Number(req.body.run_id || 0) || null;
    const limit = Math.max(1, Math.min(200, Number(req.body.limit || 50) || 50));
    const onlyNeedsFix = String(req.body.only_needs_fix || 'on') !== 'off';

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const result = await optimizeTopTrafficAndApplyUpdates({
            runId,
            limit,
            requestedBy,
            onlyNeedsFix
        });

        const effectiveRunId = runId || result.auditRunId;
        const autoApply = result.autoApply || {};
        const flash = `optimize_apply_ok:seo_optimized:${result.optimized}|seo_failed:${result.failed}|updated:${autoApply.updated || 0}|skipped:${autoApply.skipped || 0}|failed:${autoApply.failed || 0}|seo_run:${result.seoRunId || 'none'}`;
        return res.redirect(`/tools/youtube-metadata-audit?runId=${effectiveRunId}&flash=${encodeURIComponent(flash)}`);
    } catch (error) {
        console.error('YouTube optimize+update error:', error);
        const fallbackRunId = runId ? `runId=${runId}&` : '';
        return res.redirect(`/tools/youtube-metadata-audit?${fallbackRunId}flash=${encodeURIComponent(`optimize_apply_error:${error.message}`)}`);
    }
});

router.post('/youtube-metadata-audit/daily-report', async (req, res) => {
    const from = String(req.body.from || '').trim();
    const to = String(req.body.to || '').trim();

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const result = await generateAndStoreYoutubeOpsDailyReport({
            requestedBy,
            fromDate: from,
            toDate: to
        });

        const flash = `daily_report_ok:${result.reportDate}`;
        return res.redirect(`/tools/youtube-metadata-audit?flash=${encodeURIComponent(flash)}`);
    } catch (error) {
        console.error('YouTube daily report error:', error);
        return res.redirect(`/tools/youtube-metadata-audit?flash=${encodeURIComponent(`daily_report_error:${error.message}`)}`);
    }
});

router.post('/youtube-metadata-audit/daily-report-email', async (req, res) => {
    const fromDate = String(req.body.from || '').trim();
    const toDate = String(req.body.to || '').trim();
    const emailTo = String(req.body.email_to || '').trim();
    const emailCc = String(req.body.email_cc || '').trim();
    const emailBcc = String(req.body.email_bcc || '').trim();
    const subject = String(req.body.subject || '').trim();

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const fallbackTo = req.session?.user?.email || process.env.YT_DAILY_REPORT_TO || '';
        const result = await sendYoutubeOpsDailyReportEmail({
            requestedBy,
            fromDate,
            toDate,
            to: emailTo || fallbackTo,
            cc: emailCc,
            bcc: emailBcc,
            subject
        });

        const flash = `daily_report_email_ok:${result.reportDate}|to:${result.recipients.to.join(';')}`;
        return res.redirect(`/tools/youtube-metadata-audit?flash=${encodeURIComponent(flash)}`);
    } catch (error) {
        console.error('YouTube daily report email error:', error);
        return res.redirect(`/tools/youtube-metadata-audit?flash=${encodeURIComponent(`daily_report_email_error:${error.message}`)}`);
    }
});

router.post('/youtube-metadata-audit/update', async (req, res) => {
    const runId = Number(req.body.run_id || 0);
    if (!runId) {
        return res.redirect('/tools/youtube-metadata-audit?flash=update_error:missing_run_id');
    }

    const mode = String(req.body.mode || 'target_and_heuristic');
    const onlyNeedsFix = String(req.body.only_needs_fix || 'on') !== 'off';
    const limit = Math.max(1, Math.min(1000, Number(req.body.limit || 250) || 250));
    const rawVideoIds = String(req.body.video_ids || '').trim();
    const selectedVideoIds = rawVideoIds
        ? rawVideoIds.split(/[\s,]+/).map((v) => v.trim()).filter(Boolean)
        : [];

    try {
        const requestedBy = req.session?.user?.username || req.session?.user?.email || 'dashboard_user';
        const result = await applyYoutubeAuditUpdates({
            runId,
            requestedBy,
            mode,
            onlyNeedsFix,
            limit,
            selectedVideoIds
        });

        const flash = `update_ok:${result.updated}|skipped:${result.skipped}|failed:${result.failed}|processed:${result.processed}`;
        return res.redirect(`/tools/youtube-metadata-audit?runId=${runId}&flash=${encodeURIComponent(flash)}`);
    } catch (error) {
        console.error('YouTube metadata update error:', error);
        return res.redirect(`/tools/youtube-metadata-audit?runId=${runId}&flash=${encodeURIComponent(`update_error:${error.message}`)}`);
    }
});

router.get('/proxy/mission-control', (req, res) => {
    const pools = listAvailableProxyPools();
    const selected = String(req.query.pool || pools[0] || 'pia15-vpx');

    res.render('tools/proxy-mission-control', {
        title: 'Proxy Mission Control - El Inmortal 2 Dashboard',
        pools,
        selectedPool: selected
    });
});

router.get('/proxy/status', (req, res) => {
    const requestedPools = String(req.query.pools || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);

    const pools = requestedPools.length ? requestedPools : listAvailableProxyPools();
    const snapshots = pools
        .map((pool) => getProxyPoolSnapshot(pool))
        .filter(Boolean);

    const total = snapshots.reduce((acc, s) => acc + s.total, 0);
    const ready = snapshots.reduce((acc, s) => acc + s.ready, 0);

    res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        total,
        ready,
        down: total - ready,
        pools: snapshots
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

router.get('/download/youtube', async (req, res) => {
    try {
        const videoUrl = req.query.url;
        if (!videoUrl) {
            return res.status(400).json({ error: 'url is required' });
        }

        // Validate YouTube URL
        const ytId = (() => {
            try {
                const u = new URL(videoUrl);
                if (u.hostname.includes('youtu.be')) {
                    return u.pathname.replace('/', '').trim() || null;
                }
                if (u.hostname.includes('youtube.com')) {
                    return u.searchParams.get('v');
                }
                return null;
            } catch (e) {
                return null;
            }
        })();

        if (!ytId) {
            return res.status(400).json({ error: 'Invalid YouTube URL' });
        }

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const outputPath = path.join(tempDir, `yt_${ytId}.mp4`);

        // Download video using yt-dlp via youtube-dl-exec
        await ytdl(videoUrl, {
            output: outputPath,
            format: 'best[ext=mp4]/best',
            noPlaylist: true,
            maxFilesize: '100M',
        });

        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Failed to download video' });
        }

        // Stream the file and delete after sending
        const stat = fs.statSync(outputPath);
        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Content-Disposition', `inline; filename="yt_${ytId}.mp4"`);
        res.setHeader('Cache-Control', 'no-store');

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);

        // Cleanup after streaming
        stream.on('close', () => {
            try {
                fs.unlinkSync(outputPath);
            } catch (e) {
                console.error('Error deleting temp file:', e);
            }
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming video' });
            }
            try {
                fs.unlinkSync(outputPath);
            } catch (e) {
                // ignore
            }
        });

    } catch (error) {
        console.error('YouTube download error:', error);
        return res.status(500).json({ error: 'Error downloading YouTube video: ' + error.message });
    }
});

// Check if NVENC (NVIDIA GPU encoding) is available
async function checkNvencAvailable() {
    try {
        const { stdout } = await execAsync('ffmpeg -encoders 2>/dev/null | grep nvenc || echo ""');
        return stdout.includes('nvenc') || stdout.includes('h264_nvenc');
    } catch (e) {
        return false;
    }
}

// Check if NVDEC (NVIDIA GPU decoding) is available
async function checkNvdecAvailable() {
    try {
        const { stdout } = await execAsync('ffmpeg -decoders 2>/dev/null | grep cuvid || echo ""');
        return stdout.includes('cuvid') || stdout.includes('h264_cuvid');
    } catch (e) {
        return false;
    }
}

// Extract frame from video using ffmpeg (with GPU acceleration if available)
router.post('/extract-frame', async (req, res) => {
    try {
        const { videoUrl, time, format = 'png' } = req.body;
        
        if (!videoUrl || time === undefined) {
            return res.status(400).json({ error: 'videoUrl and time are required' });
        }

        const tempDir = path.join(__dirname, '../../temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        const timestamp = Date.now();
        const outputPath = path.join(tempDir, `frame_${timestamp}.${format}`);

        // Check GPU capabilities
        const hasNvdec = await checkNvdecAvailable();
        const hasNvenc = await checkNvencAvailable();

        // Build ffmpeg command with GPU acceleration if available
        let ffmpegCmd = 'ffmpeg';
        
        // Use GPU decoding if available
        if (hasNvdec) {
            ffmpegCmd += ' -hwaccel cuda -hwaccel_output_format cuda';
        }

        ffmpegCmd += ` -ss ${time} -i "${videoUrl}" -vframes 1`;

        // Use GPU encoding if available for output
        if (hasNvenc && format === 'jpg') {
            ffmpegCmd += ' -c:v h264_nvenc';
        }

        ffmpegCmd += ` -q:v 2 "${outputPath}"`;

        console.log('Running ffmpeg command:', ffmpegCmd);
        console.log('GPU acceleration:', { nvdec: hasNvdec, nvenc: hasNvenc });

        await execAsync(ffmpegCmd, { timeout: 30000 });

        if (!fs.existsSync(outputPath)) {
            return res.status(500).json({ error: 'Failed to extract frame' });
        }

        // Send the frame
        const stat = fs.statSync(outputPath);
        const contentType = format === 'jpg' ? 'image/jpeg' : 'image/png';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'no-store');

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);

        // Cleanup
        stream.on('close', () => {
            try {
                fs.unlinkSync(outputPath);
            } catch (e) {
                console.error('Error deleting temp frame file:', e);
            }
        });

        stream.on('error', (err) => {
            console.error('Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error streaming frame' });
            }
            try {
                fs.unlinkSync(outputPath);
            } catch (e) {}
        });

    } catch (error) {
        console.error('Frame extraction error:', error);
        return res.status(500).json({ 
            error: 'Error extracting frame: ' + error.message,
            gpuAccel: false 
        });
    }
});

// Get GPU info endpoint
router.get('/gpu-info', async (req, res) => {
    try {
        const hasNvdec = await checkNvdecAvailable();
        const hasNvenc = await checkNvencAvailable();
        
        let gpuName = 'Unknown';
        try {
            const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader 2>/dev/null || echo ""');
            gpuName = stdout.trim() || 'NVIDIA GPU (nvidia-smi not available)';
        } catch (e) {
            gpuName = 'NVIDIA GPU (detection failed)';
        }

        res.json({
            gpu: gpuName,
            nvdec: hasNvdec,
            nvenc: hasNvenc,
            acceleration: hasNvdec || hasNvenc ? 'available' : 'not available'
        });
    } catch (error) {
        res.status(500).json({ 
            error: 'Failed to get GPU info',
            acceleration: 'not available'
        });
    }
});

// Server-side thumbnail generation from uploaded video
router.post('/generate-thumbnail', videoUpload.single('video'), async (req, res) => {
    let videoPath = null;
    
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No se subió ningún video' });
        }

        videoPath = req.file.path;
        const time = Number(req.body.time || 0);
        const format = req.body.format || 'png';
        
        if (isNaN(time) || time < 0) {
            fs.unlinkSync(videoPath);
            return res.status(400).json({ error: 'Tiempo inválido' });
        }

        const timestamp = Date.now();
        const outputPath = path.join(uploadDir, `thumb_${timestamp}.${format}`);

        // Get video duration first
        const { stdout: durationOutput } = await execAsync(
            `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
            { timeout: 10000 }
        ).catch(() => ({ stdout: '0' }));
        
        const duration = parseFloat(durationOutput) || 0;
        const validTime = duration > 0 ? Math.min(time, duration - 0.1) : time;

        // Build ffmpeg command
        let ffmpegCmd = `ffmpeg -ss ${validTime} -i "${videoPath}" -vframes 1`;
        
        // Add format-specific options
        if (format === 'jpg' || format === 'jpeg') {
            ffmpegCmd += ' -q:v 2';
        } else {
            ffmpegCmd += ' -compression_level 3';
        }
        
        ffmpegCmd += ` -y "${outputPath}"`;

        console.log('[THUMBNAIL] Generating with ffmpeg:', ffmpegCmd);
        await execAsync(ffmpegCmd, { timeout: 30000 });

        if (!fs.existsSync(outputPath)) {
            throw new Error('No se pudo generar el thumbnail');
        }

        // Get dimensions
        const { stdout: dimsOutput } = await execAsync(
            `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=s=x:p=0 "${outputPath}"`,
            { timeout: 10000 }
        ).catch(() => ({ stdout: '1280x720' }));

        const [width, height] = dimsOutput.trim().split('x').map(Number);

        // Send response
        const stat = fs.statSync(outputPath);
        const contentType = format === 'jpg' || format === 'jpeg' ? 'image/jpeg' : 'image/png';
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('X-Thumbnail-Width', width || 1280);
        res.setHeader('X-Thumbnail-Height', height || 720);
        res.setHeader('X-Thumbnail-Time', validTime.toFixed(1));
        res.setHeader('Cache-Control', 'no-store');

        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);

        // Cleanup
        stream.on('close', () => {
            try {
                fs.unlinkSync(outputPath);
                if (videoPath && fs.existsSync(videoPath)) {
                    fs.unlinkSync(videoPath);
                }
            } catch (e) {
                console.error('[THUMBNAIL] Cleanup error:', e);
            }
        });

        stream.on('error', (err) => {
            console.error('[THUMBNAIL] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Error enviando thumbnail' });
            }
            cleanupFiles(outputPath, videoPath);
        });

    } catch (error) {
        console.error('[THUMBNAIL] Generation error:', error);
        cleanupFiles(null, videoPath);
        
        if (!res.headersSent) {
            res.status(500).json({ 
                error: 'Error generando thumbnail: ' + error.message,
                details: error.stderr || ''
            });
        }
    }
});

function cleanupFiles(outputPath, videoPath) {
    try {
        if (outputPath && fs.existsSync(outputPath)) {
            fs.unlinkSync(outputPath);
        }
        if (videoPath && fs.existsSync(videoPath)) {
            fs.unlinkSync(videoPath);
        }
    } catch (e) {
        // ignore cleanup errors
    }
}

// Remotion Studio Routes
let remotionProcess = null;
let remotionPort = 3003;

// Helper to find an available port
async function findAvailablePort(startPort) {
    const net = require('net');
    return new Promise((resolve, reject) => {
        const server = net.createServer();
        server.listen(startPort, () => {
            const port = server.address().port;
            server.close(() => resolve(port));
        });
        server.on('error', () => {
            findAvailablePort(startPort + 1).then(resolve).catch(reject);
        });
    });
}

router.get('/remotion-studio', async (req, res) => {
    const projectPath = path.join(__dirname, '../../remotion');
    const packageJsonPath = path.join(__dirname, '../../package.json');
    
    // Check if remotion directory exists
    if (!fs.existsSync(projectPath)) {
        return res.status(404).render('error', {
            title: 'Remotion No Encontrado',
            message: 'El proyecto Remotion no existe. Ejecuta "npx remotion init" primero.'
        });
    }
    
    // Start Remotion Studio if not already running
    if (!remotionProcess) {
        try {
            remotionPort = await findAvailablePort(3003);
            
    // Use server hostname from environment or default to database host
    const serverHost = process.env.REMOTION_HOST || 'db.artistaviral.com';
    
    remotionProcess = spawn('npx', ['remotion', 'studio', '--port', remotionPort.toString(), '--host', '0.0.0.0'], {
                cwd: path.join(__dirname, '../..'),
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            remotionProcess.stdout.on('data', (data) => {
                console.log(`[Remotion Studio] ${data}`);
            });
            
            remotionProcess.stderr.on('data', (data) => {
                console.error(`[Remotion Studio Error] ${data}`);
            });
            
            remotionProcess.on('close', (code) => {
                console.log(`[Remotion Studio] Process exited with code ${code}`);
                remotionProcess = null;
            });
            
            // Wait a bit for the server to start
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error('Error starting Remotion Studio:', error);
            return res.status(500).render('error', {
                title: 'Error al Iniciar Remotion',
                message: 'No se pudo iniciar Remotion Studio: ' + error.message
            });
        }
    }
    
    // Use server hostname from environment or default to database host
    const serverHost = process.env.REMOTION_HOST || 'db.artistaviral.com';
    const studioUrl = `http://${serverHost}:${remotionPort}`;
    
    res.render('tools/remotion-studio', {
        title: 'Remotion Studio - El Inmortal 2 Dashboard',
        studioUrl,
        serverHost,
        remotionPort,
        projectPath: 'remotion/',
        flash: String(req.query.flash || '')
    });
});

router.post('/remotion-studio/render', async (req, res) => {
    const { composition, output, props } = req.body;
    
    if (!composition) {
        return res.status(400).json({ error: 'Composition name is required' });
    }
    
    const outputDir = path.join(__dirname, '../../exports');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }
    
    const outputPath = output || `exports/${composition}_${Date.now()}.mp4`;
    const fullOutputPath = path.join(__dirname, '../..', outputPath);
    
    try {
        const args = ['remotion', 'render', composition, fullOutputPath];
        
        if (props) {
            args.push('--props', JSON.stringify(props));
        }
        
        const { stdout, stderr } = await execAsync(`npx ${args.join(' ')}`, {
            cwd: path.join(__dirname, '../..'),
            timeout: 300000 // 5 minutes timeout
        });
        
        if (fs.existsSync(fullOutputPath)) {
            res.json({
                success: true,
                outputPath: outputPath,
                message: 'Video rendered successfully'
            });
        } else {
            throw new Error('Output file was not created');
        }
        
    } catch (error) {
        console.error('Render error:', error);
        res.status(500).json({
            error: 'Render failed: ' + error.message,
            details: error.stderr || ''
        });
    }
});

router.post('/remotion-studio/stop', (req, res) => {
    if (remotionProcess) {
        remotionProcess.kill();
        remotionProcess = null;
        res.json({ success: true, message: 'Remotion Studio stopped' });
    } else {
        res.json({ success: true, message: 'Remotion Studio was not running' });
    }
});

module.exports = router;
