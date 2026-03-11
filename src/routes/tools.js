const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const net = require('net');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const { getAll, getOne, run } = require('../config/database');
const router = express.Router();
const ytdl = require('youtube-dl-exec');
const multer = require('multer');
const execAsync = promisify(exec);
const proxyGeneratedRoot = path.join(__dirname, '../../scripts/proxy/generated');
const { ensureLandingLeadsTable, saveNFCCode, registerOrUpdateLead } = require('../utils/landingDb');
const { syncUserToNotion } = require('../utils/notionHelper');
const { sendMiniDiscShippedEmail, sendMiniDiscDelayEmail, sendMiniDiscConfirmationEmail } = require('../utils/emailHelper');
const { getOrderStatus, createPayPalCartOrder, capturePayPalOrder, getPayPalConfig } = require('../utils/paypalHelper');
const { normalizePersonName } = require('../utils/nameCase');
const {
    isSpotifyConfigured,
    normalizeSpotifyArtistFilter,
    searchSpotifyTracks
} = require('../utils/spotifyHelper');

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

function redirectMiniDiscOrders(res, type, message) {
    const flash = encodeURIComponent(`${type}:${message}`);
    return res.redirect(`/tools/minidisc-orders?flash=${flash}`);
}

function parseMiniDiscFlash(raw) {
    const value = String(raw || '').trim();
    if (!value) return null;

    const separatorIdx = value.indexOf(':');
    if (separatorIdx <= 0) {
        return { type: 'info', message: value };
    }

    const type = value.slice(0, separatorIdx).trim().toLowerCase();
    const message = value.slice(separatorIdx + 1).trim();
    return {
        type: ['success', 'error', 'warn', 'info'].includes(type) ? type : 'info',
        message: message || value
    };
}

const STICKY_NOTE_DEFAULT_COLOR = '#FDE68A';
const STICKY_NOTE_ALLOWED_COLORS = new Set([
    '#FDE68A',
    '#FCA5A5',
    '#BFDBFE',
    '#A7F3D0',
    '#DDD6FE',
    '#FBCFE8',
    '#FEF3C7',
    '#E2E8F0'
]);

function getStickyNotesUserId(req) {
    const userId = Number(req.session?.user?.id || 0);
    return Number.isInteger(userId) && userId > 0 ? userId : 0;
}

function clampStickyNumber(value, min, max, fallback) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallback;
    }

    if (parsed < min) return min;
    if (parsed > max) return max;
    return parsed;
}

function normalizeStickyText(value, maxLen) {
    return String(value || '')
        .replace(/\r\n/g, '\n')
        .replace(/\u0000/g, '')
        .slice(0, maxLen)
        .trim();
}

function normalizeStickyColor(rawColor) {
    const normalized = String(rawColor || '').trim().toUpperCase();
    if (STICKY_NOTE_ALLOWED_COLORS.has(normalized)) {
        return normalized;
    }

    return STICKY_NOTE_DEFAULT_COLOR;
}

function mapStickyNote(row) {
    return {
        id: Number(row.id),
        title: String(row.title || ''),
        content: String(row.content || ''),
        color: normalizeStickyColor(row.color),
        x: Number(row.pos_x || 36),
        y: Number(row.pos_y || 36),
        width: Number(row.width || 260),
        height: Number(row.height || 220),
        zIndex: Number(row.z_index || 1),
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

async function ensureStickyNotesTable() {
    const isSQLite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;

    if (isSQLite) {
        await run(
            `CREATE TABLE IF NOT EXISTS dashboard_sticky_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                title TEXT NOT NULL DEFAULT '',
                content TEXT,
                color TEXT NOT NULL DEFAULT '#FDE68A',
                pos_x INTEGER NOT NULL DEFAULT 36,
                pos_y INTEGER NOT NULL DEFAULT 36,
                width INTEGER NOT NULL DEFAULT 260,
                height INTEGER NOT NULL DEFAULT 220,
                z_index INTEGER NOT NULL DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        );
        return;
    }

    await run(
        `CREATE TABLE IF NOT EXISTS dashboard_sticky_notes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            title VARCHAR(120) NOT NULL DEFAULT '',
            content TEXT NULL,
            color VARCHAR(16) NOT NULL DEFAULT '#FDE68A',
            pos_x INT NOT NULL DEFAULT 36,
            pos_y INT NOT NULL DEFAULT 36,
            width INT NOT NULL DEFAULT 260,
            height INT NOT NULL DEFAULT 220,
            z_index INT NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            KEY idx_sticky_user (user_id),
            KEY idx_sticky_user_z (user_id, z_index)
        )`
    );
}

const CODE_EDITOR_ROOT = path.resolve(
    String(process.env.DASHBOARD_CODE_EDITOR_ROOT || path.join(__dirname, '../..')).trim() || path.join(__dirname, '../..')
);
const CODE_EDITOR_MAX_BYTES = Number.parseInt(process.env.CODE_EDITOR_MAX_BYTES || `${2 * 1024 * 1024}`, 10) || (2 * 1024 * 1024);
const CODE_EDITOR_BLOCKED_DIRS = new Set(['.git', 'node_modules']);
const CODE_SERVER_PORT = Math.max(1024, Math.min(65535, Number.parseInt(process.env.CODE_EDITOR_PORT || '13337', 10) || 13337));
const CODE_SERVER_HOST = String(process.env.CODE_EDITOR_HOST || '127.0.0.1').trim() || '127.0.0.1';
const CODE_SERVER_CONTAINER_NAME = String(process.env.CODE_EDITOR_CONTAINER_NAME || 'ei2-code-server').trim() || 'ei2-code-server';
const CODE_SERVER_SERVICE_NAME = String(process.env.CODE_EDITOR_SERVICE_NAME || 'code-server').trim() || 'code-server';
const CODE_SERVER_PROXY_PREFIX = '/tools/code-editor/vscode/ide';
const CODE_SERVER_COMPOSE_FILE = path.join(__dirname, '../../scripts/code-editor/docker-compose.code-server.yml');
const CODE_SERVER_WORKSPACE_ROOT = path.resolve(
    String(process.env.DASHBOARD_CODE_EDITOR_ROOT || CODE_EDITOR_ROOT).trim() || CODE_EDITOR_ROOT
);
const CODE_SERVER_STARTUP_TIMEOUT_MS = Math.max(
    10000,
    Math.min(180000, Number.parseInt(process.env.CODE_EDITOR_STARTUP_TIMEOUT_MS || '90000', 10) || 90000)
);
const CODE_SERVER_AUTO_START = String(process.env.CODE_EDITOR_AUTO_START || 'true').trim().toLowerCase() !== 'false';
let dockerComposeCommandCache = null;

function toCodeEditorPosixPath(value) {
    return String(value || '').replace(/\\/g, '/');
}

function resolveCodeEditorPath(rawPath) {
    const requested = toCodeEditorPosixPath(rawPath)
        .replace(/\u0000/g, '')
        .trim();
    const normalizedRelative = requested.replace(/^\/+/, '');
    const absolutePath = path.resolve(CODE_EDITOR_ROOT, normalizedRelative || '.');
    const relativePath = path.relative(CODE_EDITOR_ROOT, absolutePath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        const error = new Error('path_outside_root');
        error.statusCode = 400;
        throw error;
    }

    return {
        absolutePath,
        relativePath: toCodeEditorPosixPath(relativePath)
    };
}

function isLikelyBinary(buffer) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        return false;
    }

    const sampleSize = Math.min(buffer.length, 4096);
    let suspicious = 0;
    for (let idx = 0; idx < sampleSize; idx += 1) {
        const value = buffer[idx];
        if (value === 0) {
            return true;
        }
        if ((value < 9 || (value > 13 && value < 32)) && value !== 27) {
            suspicious += 1;
        }
    }

    return (suspicious / sampleSize) > 0.2;
}

function normalizeCodeServerTargetPath(rawUrl) {
    const urlValue = String(rawUrl || '/');
    if (urlValue.startsWith(CODE_SERVER_PROXY_PREFIX)) {
        const sliced = urlValue.slice(CODE_SERVER_PROXY_PREFIX.length);
        return sliced || '/';
    }

    return urlValue || '/';
}

function buildCodeServerExecOptions(timeoutMs = CODE_SERVER_STARTUP_TIMEOUT_MS) {
    return {
        cwd: path.join(__dirname, '../..'),
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: {
            ...process.env,
            DASHBOARD_CODE_EDITOR_ROOT: CODE_SERVER_WORKSPACE_ROOT,
            CODE_EDITOR_PORT: String(CODE_SERVER_PORT),
            CODE_EDITOR_CONTAINER_NAME: CODE_SERVER_CONTAINER_NAME,
            CODE_EDITOR_SERVICE_NAME: CODE_SERVER_SERVICE_NAME
        }
    };
}

async function runCodeServerCompose(command, timeoutMs = CODE_SERVER_STARTUP_TIMEOUT_MS) {
    if (!fs.existsSync(CODE_SERVER_COMPOSE_FILE)) {
        throw new Error('missing_code_server_compose_file');
    }

    const composeCmd = await resolveDockerComposeCommand();
    const composeCommand = `${composeCmd} -f "${CODE_SERVER_COMPOSE_FILE}" ${command}`;
    return await execAsync(composeCommand, buildCodeServerExecOptions(timeoutMs));
}

async function resolveDockerComposeCommand() {
    if (dockerComposeCommandCache) {
        return dockerComposeCommandCache;
    }

    try {
        await execAsync('docker compose version', buildCodeServerExecOptions(15000));
        dockerComposeCommandCache = 'docker compose';
        return dockerComposeCommandCache;
    } catch (_error) {
        try {
            await execAsync('docker-compose --version', buildCodeServerExecOptions(15000));
            dockerComposeCommandCache = 'docker-compose';
            return dockerComposeCommandCache;
        } catch (composeError) {
            throw new Error(`docker_compose_not_available:${composeError.message}`);
        }
    }
}

async function getCodeServerStatus() {
    try {
        const { stdout } = await execAsync(
            `docker ps -a --filter "name=^/${CODE_SERVER_CONTAINER_NAME}$" --format "{{.Names}}|{{.State}}|{{.Status}}"`,
            buildCodeServerExecOptions(20000)
        );

        const line = String(stdout || '').trim();
        if (!line) {
            return {
                exists: false,
                running: false,
                state: 'missing',
                status: 'container_not_created'
            };
        }

        const [name, state, status] = line.split('|');
        return {
            exists: true,
            running: String(state || '').trim() === 'running',
            container: String(name || CODE_SERVER_CONTAINER_NAME).trim(),
            state: String(state || '').trim() || 'unknown',
            status: String(status || '').trim() || 'unknown'
        };
    } catch (error) {
        return {
            exists: false,
            running: false,
            state: 'error',
            status: error.message
        };
    }
}

async function startCodeServerContainer({ forceRecreate = false } = {}) {
    const command = forceRecreate ? 'up -d --force-recreate' : 'up -d';
    return await runCodeServerCompose(command);
}

async function stopCodeServerContainer() {
    return await runCodeServerCompose('stop', 60000);
}

async function ensureCodeServerRunning() {
    const status = await getCodeServerStatus();
    if (status.running || !CODE_SERVER_AUTO_START) {
        return status;
    }

    await startCodeServerContainer();
    return await getCodeServerStatus();
}

async function waitForCodeServerRunning(timeoutMs = 30000) {
    const startedAt = Date.now();

    while ((Date.now() - startedAt) < timeoutMs) {
        const status = await getCodeServerStatus();
        if (status.running) {
            return status;
        }

        await new Promise((resolve) => setTimeout(resolve, 800));
    }

    return await getCodeServerStatus();
}

function writeUpgradeError(socket, statusCode, reason) {
    if (!socket || socket.destroyed) {
        return;
    }

    const safeCode = Number(statusCode) || 500;
    const safeReason = String(reason || 'Error').replace(/[\r\n]+/g, ' ').trim() || 'Error';
    socket.write(`HTTP/1.1 ${safeCode} ${safeReason}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

function isCodeEditorUpgradeRequest(req) {
    const reqUrl = String(req?.url || '');
    return reqUrl.startsWith(CODE_SERVER_PROXY_PREFIX);
}

function handleCodeEditorUpgrade(req, socket, head) {
    const targetPath = normalizeCodeServerTargetPath(req.url);
    const upstream = net.connect({ host: CODE_SERVER_HOST, port: CODE_SERVER_PORT });

    let settled = false;

    upstream.setNoDelay(true);
    socket.setNoDelay(true);

    upstream.on('connect', () => {
        const requestLines = [`GET ${targetPath} HTTP/1.1`];
        const seenHeaders = new Set();

        for (let idx = 0; idx < req.rawHeaders.length; idx += 2) {
            const key = req.rawHeaders[idx];
            const value = req.rawHeaders[idx + 1];
            if (!key) {
                continue;
            }

            const lower = key.toLowerCase();
            if (lower === 'host') {
                continue;
            }

            seenHeaders.add(lower);
            requestLines.push(`${key}: ${value}`);
        }

        requestLines.push(`Host: ${CODE_SERVER_HOST}:${CODE_SERVER_PORT}`);
        if (!seenHeaders.has('x-forwarded-host')) {
            requestLines.push(`X-Forwarded-Host: ${req.headers.host || ''}`);
        }
        if (!seenHeaders.has('x-forwarded-proto')) {
            requestLines.push(`X-Forwarded-Proto: ${req.headers['x-forwarded-proto'] || 'https'}`);
        }
        requestLines.push('\r\n');

        upstream.write(requestLines.join('\r\n'));
        if (head && head.length) {
            upstream.write(head);
        }

        settled = true;
        socket.pipe(upstream).pipe(socket);
    });

    upstream.on('error', (error) => {
        if (!settled) {
            writeUpgradeError(socket, 502, `Bad Gateway (${error.message})`);
        } else {
            socket.destroy();
        }
    });

    socket.on('error', () => {
        upstream.destroy();
    });

    socket.on('close', () => {
        upstream.destroy();
    });
}

function proxyCodeServerHttp(req, res) {
    const targetPath = normalizeCodeServerTargetPath(req.originalUrl || req.url);

    let bufferedBody = null;
    if (req.readableEnded || req.complete) {
        if (typeof req.body === 'string' && req.body.length > 0) {
            bufferedBody = Buffer.from(req.body);
        } else if (Buffer.isBuffer(req.body) && req.body.length > 0) {
            bufferedBody = req.body;
        } else if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
            bufferedBody = Buffer.from(JSON.stringify(req.body));
        }
    }

    const proxyHeaders = {
        ...req.headers,
        host: `${CODE_SERVER_HOST}:${CODE_SERVER_PORT}`,
        'x-forwarded-host': req.headers.host || '',
        'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https'
    };

    if (bufferedBody) {
        proxyHeaders['content-length'] = String(bufferedBody.length);
        if (!proxyHeaders['content-type']) {
            proxyHeaders['content-type'] = 'application/json';
        }
    } else {
        delete proxyHeaders['content-length'];
    }

    const options = {
        hostname: CODE_SERVER_HOST,
        port: CODE_SERVER_PORT,
        method: req.method,
        path: targetPath,
        headers: proxyHeaders
    };

    const upstreamRequest = http.request(options, (upstreamResponse) => {
        res.status(upstreamResponse.statusCode || 502);

        for (const [headerKey, headerValue] of Object.entries(upstreamResponse.headers || {})) {
            if (headerValue === undefined) {
                continue;
            }
            res.setHeader(headerKey, headerValue);
        }

        upstreamResponse.pipe(res);
    });

    upstreamRequest.on('error', (error) => {
        if (!res.headersSent) {
            res.status(502).send(`Code Server proxy error: ${error.message}`);
            return;
        }

        res.end();
    });

    if (req.readableEnded || req.complete) {
        if (bufferedBody) {
            upstreamRequest.write(bufferedBody);
        }
        upstreamRequest.end();
        return;
    }

    req.pipe(upstreamRequest);
}

async function syncMiniDiscOrderToNotion(orderId) {
    if (process.env.NOTION_SYNC_ENABLED !== 'true') {
        return { skipped: true, reason: 'disabled' };
    }

    try {
        const user = await getOne('SELECT * FROM landing_email_leads WHERE id = ?', [orderId]);
        if (!user) {
            return { skipped: true, reason: 'user_not_found' };
        }

        return await syncUserToNotion(user);
    } catch (error) {
        console.error('[MiniDisc Orders] Error sincronizando Notion:', error.message);
        return { success: false, error: error.message };
    }
}

const MINI_DISC_ORDERS_BASE_SELECT = `SELECT
    id,
    email,
    full_name,
    country,
    created_at,
    paypal_order_id,
    paypal_payment_status,
    paypal_payer_email,
    paypal_amount_value,
    paypal_amount_currency,
    paypal_capture_id,
    shipping_name,
    shipping_address_line1,
    shipping_address_line2,
    shipping_city,
    shipping_state,
    shipping_postal_code,
    shipping_country_code,
    nfc_unique_code,
    nfc_link,
    minidisc_delay_email_sent,
    minidisc_delay_email_sent_at,
    package_shipped,
    tracking_number
 FROM landing_email_leads`;

function parseMiniDiscAmount(value) {
    const parsed = Number.parseFloat(String(value || '').trim());
    return Number.isFinite(parsed) ? parsed : null;
}

function formatMiniDiscAmount(value, currency) {
    const amountNumber = parseMiniDiscAmount(value);
    if (amountNumber === null) {
        return 'N/A';
    }

    const normalizedCurrency = String(currency || 'USD').trim() || 'USD';
    return `$${amountNumber.toFixed(2)} ${normalizedCurrency}`;
}

const MINI_DISC_COUNTRY_FALLBACK = {
    MX: 'Mexico',
    US: 'United States',
    PR: 'Puerto Rico',
    DO: 'Dominican Republic',
    ES: 'Spain',
    CO: 'Colombia',
    AR: 'Argentina',
    CL: 'Chile',
    PE: 'Peru',
    VE: 'Venezuela'
};

function resolveMiniDiscCountry(rawCountry) {
    const trimmed = String(rawCountry || '').trim();
    if (!trimmed) {
        return { code: '', name: '' };
    }

    const normalizedCode = trimmed.toUpperCase();
    const looksLikeIsoCode = /^[A-Z]{2}$/.test(normalizedCode);

    if (!looksLikeIsoCode) {
        return {
            code: '',
            name: trimmed
        };
    }

    const fallbackName = MINI_DISC_COUNTRY_FALLBACK[normalizedCode] || normalizedCode;

    let displayName = fallbackName;
    try {
        if (Intl && typeof Intl.DisplayNames === 'function') {
            const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
            const intlName = regionNames.of(normalizedCode);
            if (intlName && intlName !== normalizedCode) {
                displayName = intlName;
            }
        }
    } catch (_error) {
        // fallback map already assigned
    }

    return {
        code: normalizedCode,
        name: displayName
    };
}

function normalizeMiniDiscOrder(order) {
    const fullName = String(order.full_name || '').trim();
    const shippingName = String(order.shipping_name || fullName).trim();
    const shippingLine1 = String(order.shipping_address_line1 || '').trim();
    const shippingLine2 = String(order.shipping_address_line2 || '').trim();
    const shippingCity = String(order.shipping_city || '').trim();
    const shippingState = String(order.shipping_state || '').trim();
    const shippingPostalCode = String(order.shipping_postal_code || '').trim();
    const resolvedCountry = resolveMiniDiscCountry(order.shipping_country_code);
    const shippingCountryCode = resolvedCountry.code;
    const shippingCountryName = resolvedCountry.name;
    const amountValue = String(order.paypal_amount_value || '').trim();
    const amountCurrency = String(order.paypal_amount_currency || 'USD').trim() || 'USD';
    const amountNumber = parseMiniDiscAmount(amountValue);
    const uspsDomestic = shippingCountryCode === 'US';
    const uspsInternational = Boolean(shippingCountryCode) && !uspsDomestic;

    const cityStatePostal = [
        [shippingCity, shippingState].filter(Boolean).join(', ').trim(),
        shippingPostalCode
    ].filter(Boolean).join(' ').trim();

    const addressLines = [
        shippingName,
        shippingLine1,
        shippingLine2,
        cityStatePostal,
        shippingCountryName || shippingCountryCode
    ].filter(Boolean);

    const needsState = shippingCountryCode === 'US';
    const hasCountry = Boolean(shippingCountryCode || shippingCountryName);
    const shippingReady = Boolean(
        shippingName &&
        shippingLine1 &&
        shippingCity &&
        shippingPostalCode &&
        hasCountry &&
        (!needsState || shippingState)
    );

    return {
        ...order,
        full_name: fullName,
        package_shipped: Number(order.package_shipped) === 1,
        tracking_number: String(order.tracking_number || '').trim(),
        minidisc_delay_email_sent: Number(order.minidisc_delay_email_sent) === 1,
        minidisc_delay_email_sent_at: order.minidisc_delay_email_sent_at || null,
        delay_email_sent: Number(order.minidisc_delay_email_sent) === 1,
        delay_email_sent_at: order.minidisc_delay_email_sent_at || null,
        shipping_name: shippingName,
        shipping_address_line1: shippingLine1,
        shipping_address_line2: shippingLine2,
        shipping_city: shippingCity,
        shipping_state: shippingState,
        shipping_postal_code: shippingPostalCode,
        shipping_country_code: shippingCountryCode,
        shipping_country_name: shippingCountryName,
        paypal_amount_value: amountValue,
        paypal_amount_currency: amountCurrency,
        amount_number: amountNumber,
        amount_display: formatMiniDiscAmount(amountValue, amountCurrency),
        address_lines: addressLines,
        shipping_ready: shippingReady,
        usps_domestic: uspsDomestic,
        usps_international: uspsInternational,
        usps_customs_required: uspsInternational
    };
}

function needsMiniDiscPayPalBackfill(order) {
    if (!order || !order.paypal_order_id) {
        return false;
    }

    const country = String(order.shipping_country_code || '').trim().toUpperCase();
    const needsState = country === 'US';

    return (
        !order.paypal_amount_value ||
        !order.shipping_address_line1 ||
        !order.shipping_city ||
        !order.shipping_postal_code ||
        !order.shipping_country_code ||
        (needsState && !order.shipping_state)
    );
}

async function backfillMiniDiscOrderFromPayPal(order) {
    if (!needsMiniDiscPayPalBackfill(order)) {
        return false;
    }

    try {
        const status = await getOrderStatus(order.paypal_order_id);
        if (!status.success || !Array.isArray(status.purchaseUnits) || status.purchaseUnits.length === 0) {
            return false;
        }

        const purchaseUnit = status.purchaseUnits[0] || {};
        const amount = purchaseUnit.amount || {};
        const shipping = purchaseUnit.shipping || {};
        const address = shipping.address || {};

        const amountValue = String(amount.value || order.paypal_amount_value || '').trim() || null;
        const amountCurrency = String(amount.currency_code || order.paypal_amount_currency || 'USD').trim() || 'USD';
        const shippingName = String(shipping?.name?.full_name || order.shipping_name || order.full_name || '').trim() || null;
        const shippingAddressLine1 = String(address.address_line_1 || order.shipping_address_line1 || '').trim() || null;
        const shippingAddressLine2 = String(address.address_line_2 || order.shipping_address_line2 || '').trim() || null;
        const shippingCity = String(address.admin_area_2 || order.shipping_city || '').trim() || null;
        const shippingState = String(address.admin_area_1 || order.shipping_state || '').trim() || null;
        const shippingPostalCode = String(address.postal_code || order.shipping_postal_code || '').trim() || null;
        const shippingCountryCode = String(address.country_code || order.shipping_country_code || '').trim().toUpperCase() || null;

        await run(
            `UPDATE landing_email_leads
             SET paypal_amount_value = ?,
                 paypal_amount_currency = ?,
                 shipping_name = ?,
                 shipping_address_line1 = ?,
                 shipping_address_line2 = ?,
                 shipping_city = ?,
                 shipping_state = ?,
                 shipping_postal_code = ?,
                 shipping_country_code = ?
             WHERE id = ?`,
            [
                amountValue,
                amountCurrency,
                shippingName,
                shippingAddressLine1,
                shippingAddressLine2,
                shippingCity,
                shippingState,
                shippingPostalCode,
                shippingCountryCode,
                order.id
            ]
        );

        return true;
    } catch (error) {
        console.error(`[MiniDisc Orders] Error backfilling PayPal order ${order.paypal_order_id}:`, error.message);
        return false;
    }
}

async function getMiniDiscCapturedOrders() {
    return await getAll(
        `${MINI_DISC_ORDERS_BASE_SELECT}
         WHERE paypal_payment_status = 'captured'
         ORDER BY package_shipped ASC, created_at DESC`
    );
}

function parseMiniDiscOrderIds(rawIds) {
    const candidates = Array.isArray(rawIds)
        ? rawIds
        : String(rawIds || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean);

    const normalized = candidates
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value > 0);

    return [...new Set(normalized)];
}

function getMiniDiscSenderAddress() {
    const name = String(process.env.MINIDISC_SENDER_NAME || 'Alex Serrano').trim();
    const line1 = String(process.env.MINIDISC_SENDER_LINE1 || '4431 Ave. Constancia').trim();
    const line2 = String(process.env.MINIDISC_SENDER_LINE2 || 'Urb. Villa del Carmen').trim();
    const cityStatePostal = String(process.env.MINIDISC_SENDER_CITY_STATE_POSTAL || 'Ponce, PR 00716').trim();
    const country = String(process.env.MINIDISC_SENDER_COUNTRY || 'Puerto Rico, USA').trim();

    return {
        name,
        line1,
        line2,
        cityStatePostal,
        country,
        lines: [name, line1, line2, cityStatePostal, country].filter(Boolean)
    };
}

const MINI_DISC_GENERATOR_CART_SESSION_KEY = 'minidiscGeneratorCheckout';
const MINI_DISC_GENERATOR_UNIT_PRICE = (() => {
    const configured = Number(process.env.MINIDISC_GENERATOR_UNIT_PRICE || 15);
    return Number.isFinite(configured) && configured > 0 ? configured : 15;
})();

function isValidEmailAddress(value) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeMiniDiscGeneratorCartItems(rawItems) {
    const items = Array.isArray(rawItems) ? rawItems : [];
    const aggregated = new Map();

    for (const rawItem of items) {
        const trackId = String(rawItem?.id || '').trim();
        if (!trackId) {
            continue;
        }

        const title = String(rawItem?.title || 'Mini-Disc Personalizado').trim().slice(0, 120);
        const artistsLabel = String(rawItem?.artistsLabel || '').trim().slice(0, 140);
        const cover = String(rawItem?.cover || '').trim();
        const spotifyUrl = String(rawItem?.spotifyUrl || '').trim();
        const qty = Math.min(Math.max(Number.parseInt(rawItem?.qty, 10) || 1, 1), 25);

        const current = aggregated.get(trackId);
        if (current) {
            current.qty = Math.min(current.qty + qty, 25);
            continue;
        }

        aggregated.set(trackId, {
            id: trackId,
            title: title || 'Mini-Disc Personalizado',
            artistsLabel,
            cover,
            spotifyUrl,
            qty,
            unitPrice: MINI_DISC_GENERATOR_UNIT_PRICE
        });
    }

    return [...aggregated.values()];
}

function getMiniDiscGeneratorCartSummary(items) {
    const safeItems = Array.isArray(items) ? items : [];
    const itemCount = safeItems.reduce((sum, item) => sum + (Number(item?.qty) || 0), 0);
    const totalAmount = safeItems.reduce(
        (sum, item) => sum + ((Number(item?.qty) || 0) * (Number(item?.unitPrice) || MINI_DISC_GENERATOR_UNIT_PRICE)),
        0
    );

    return {
        itemCount,
        totalAmount,
        currency: 'USD'
    };
}

async function ensureMiniDiscGeneratorOrderItemsTable() {
    const isSQLite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;

    if (isSQLite) {
        await run(
            `CREATE TABLE IF NOT EXISTS minidisc_generator_order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                lead_id INTEGER NOT NULL,
                paypal_order_id TEXT NOT NULL,
                paypal_capture_id TEXT,
                track_id TEXT NOT NULL,
                track_title TEXT NOT NULL,
                track_artists TEXT,
                track_cover_url TEXT,
                spotify_url TEXT,
                quantity INTEGER NOT NULL DEFAULT 1,
                unit_price TEXT NOT NULL DEFAULT '15.00',
                currency TEXT NOT NULL DEFAULT 'USD',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        );
        return;
    }

    await run(
        `CREATE TABLE IF NOT EXISTS minidisc_generator_order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            lead_id INT NOT NULL,
            paypal_order_id VARCHAR(255) NOT NULL,
            paypal_capture_id VARCHAR(255) NULL,
            track_id VARCHAR(120) NOT NULL,
            track_title VARCHAR(255) NOT NULL,
            track_artists VARCHAR(255) NULL,
            track_cover_url VARCHAR(1000) NULL,
            spotify_url VARCHAR(1000) NULL,
            quantity INT NOT NULL DEFAULT 1,
            unit_price DECIMAL(10,2) NOT NULL DEFAULT 15.00,
            currency VARCHAR(10) NOT NULL DEFAULT 'USD',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            KEY idx_mdgoi_lead_id (lead_id),
            KEY idx_mdgoi_paypal_order_id (paypal_order_id)
        )`
    );
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

router.get('/notes', async (req, res) => {
    try {
        await ensureStickyNotesTable();
        res.render('tools/notes', {
            title: 'Notes - El Inmortal 2 Dashboard',
            noteColors: Array.from(STICKY_NOTE_ALLOWED_COLORS)
        });
    } catch (error) {
        console.error('[Sticky Notes] Error cargando vista:', error);
        res.status(500).render('error', {
            title: 'Error',
            message: 'No se pudo cargar el tool de Notes.',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

router.get('/notes/api', async (req, res) => {
    try {
        const userId = getStickyNotesUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }

        await ensureStickyNotesTable();
        const rows = await getAll(
            `SELECT id, title, content, color, pos_x, pos_y, width, height, z_index, created_at, updated_at
             FROM dashboard_sticky_notes
             WHERE user_id = ?
             ORDER BY z_index ASC, updated_at DESC`,
            [userId]
        );

        return res.json({
            success: true,
            notes: rows.map(mapStickyNote)
        });
    } catch (error) {
        console.error('[Sticky Notes] Error listando notas:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/notes/api', async (req, res) => {
    try {
        const userId = getStickyNotesUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }

        await ensureStickyNotesTable();

        const title = normalizeStickyText(req.body.title, 120);
        const content = normalizeStickyText(req.body.content, 8000);
        const color = normalizeStickyColor(req.body.color);
        const x = clampStickyNumber(req.body.x, -500, 6000, 36);
        const y = clampStickyNumber(req.body.y, -500, 6000, 36);
        const width = clampStickyNumber(req.body.width, 200, 480, 260);
        const height = clampStickyNumber(req.body.height, 180, 620, 220);

        const maxZRow = await getOne(
            'SELECT COALESCE(MAX(z_index), 0) AS max_z FROM dashboard_sticky_notes WHERE user_id = ?',
            [userId]
        );
        const zIndex = Math.min((Number(maxZRow?.max_z || 0) + 1), 9999);

        const insertResult = await run(
            `INSERT INTO dashboard_sticky_notes
             (user_id, title, content, color, pos_x, pos_y, width, height, z_index)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, title, content, color, x, y, width, height, zIndex]
        );

        const created = await getOne(
            `SELECT id, title, content, color, pos_x, pos_y, width, height, z_index, created_at, updated_at
             FROM dashboard_sticky_notes
             WHERE id = ? AND user_id = ?`,
            [insertResult.lastID, userId]
        );

        return res.status(201).json({
            success: true,
            note: mapStickyNote(created)
        });
    } catch (error) {
        console.error('[Sticky Notes] Error creando nota:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.patch('/notes/api/:id', async (req, res) => {
    try {
        const userId = getStickyNotesUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }

        const noteId = Number(req.params.id || 0);
        if (!Number.isInteger(noteId) || noteId <= 0) {
            return res.status(400).json({ success: false, error: 'invalid_note_id' });
        }

        await ensureStickyNotesTable();

        const existing = await getOne(
            `SELECT id, title, content, color, pos_x, pos_y, width, height, z_index
             FROM dashboard_sticky_notes
             WHERE id = ? AND user_id = ?`,
            [noteId, userId]
        );

        if (!existing) {
            return res.status(404).json({ success: false, error: 'note_not_found' });
        }

        const title = Object.prototype.hasOwnProperty.call(req.body, 'title')
            ? normalizeStickyText(req.body.title, 120)
            : String(existing.title || '');
        const content = Object.prototype.hasOwnProperty.call(req.body, 'content')
            ? normalizeStickyText(req.body.content, 8000)
            : String(existing.content || '');
        const color = Object.prototype.hasOwnProperty.call(req.body, 'color')
            ? normalizeStickyColor(req.body.color)
            : normalizeStickyColor(existing.color);
        const x = Object.prototype.hasOwnProperty.call(req.body, 'x')
            ? clampStickyNumber(req.body.x, -500, 6000, Number(existing.pos_x || 36))
            : Number(existing.pos_x || 36);
        const y = Object.prototype.hasOwnProperty.call(req.body, 'y')
            ? clampStickyNumber(req.body.y, -500, 6000, Number(existing.pos_y || 36))
            : Number(existing.pos_y || 36);
        const width = Object.prototype.hasOwnProperty.call(req.body, 'width')
            ? clampStickyNumber(req.body.width, 200, 480, Number(existing.width || 260))
            : Number(existing.width || 260);
        const height = Object.prototype.hasOwnProperty.call(req.body, 'height')
            ? clampStickyNumber(req.body.height, 180, 620, Number(existing.height || 220))
            : Number(existing.height || 220);
        const zIndex = Object.prototype.hasOwnProperty.call(req.body, 'zIndex')
            ? clampStickyNumber(req.body.zIndex, 1, 9999, Number(existing.z_index || 1))
            : Number(existing.z_index || 1);

        await run(
            `UPDATE dashboard_sticky_notes
             SET title = ?,
                 content = ?,
                 color = ?,
                 pos_x = ?,
                 pos_y = ?,
                 width = ?,
                 height = ?,
                 z_index = ?
             WHERE id = ? AND user_id = ?`,
            [title, content, color, x, y, width, height, zIndex, noteId, userId]
        );

        const updated = await getOne(
            `SELECT id, title, content, color, pos_x, pos_y, width, height, z_index, created_at, updated_at
             FROM dashboard_sticky_notes
             WHERE id = ? AND user_id = ?`,
            [noteId, userId]
        );

        return res.json({ success: true, note: mapStickyNote(updated) });
    } catch (error) {
        console.error('[Sticky Notes] Error actualizando nota:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/notes/api/:id', async (req, res) => {
    try {
        const userId = getStickyNotesUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }

        const noteId = Number(req.params.id || 0);
        if (!Number.isInteger(noteId) || noteId <= 0) {
            return res.status(400).json({ success: false, error: 'invalid_note_id' });
        }

        await ensureStickyNotesTable();
        const deleteResult = await run(
            'DELETE FROM dashboard_sticky_notes WHERE id = ? AND user_id = ?',
            [noteId, userId]
        );

        if (Number(deleteResult.changes || 0) === 0) {
            return res.status(404).json({ success: false, error: 'note_not_found' });
        }

        return res.json({ success: true, noteId });
    } catch (error) {
        console.error('[Sticky Notes] Error borrando nota:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.delete('/notes/api', async (req, res) => {
    try {
        const userId = getStickyNotesUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }

        await ensureStickyNotesTable();
        const deleteResult = await run(
            'DELETE FROM dashboard_sticky_notes WHERE user_id = ?',
            [userId]
        );

        return res.json({
            success: true,
            deletedCount: Number(deleteResult.changes || 0)
        });
    } catch (error) {
        console.error('[Sticky Notes] Error limpiando notas:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/code-editor', (_req, res) => {
    res.render('tools/code-editor', {
        title: 'Code Editor - El Inmortal 2 Dashboard',
        editorRoot: CODE_EDITOR_ROOT,
        maxBytes: CODE_EDITOR_MAX_BYTES,
        codeServerProxyPath: `${CODE_SERVER_PROXY_PREFIX}/`,
        codeServerHost: CODE_SERVER_HOST,
        codeServerPort: CODE_SERVER_PORT,
        codeServerContainerName: CODE_SERVER_CONTAINER_NAME
    });
});

router.get('/code-editor/api/list', async (req, res) => {
    try {
        const requestedPath = String(req.query.path || '');
        const { absolutePath, relativePath } = resolveCodeEditorPath(requestedPath);
        const rootStat = await fs.promises.stat(absolutePath);

        if (!rootStat.isDirectory()) {
            return res.status(400).json({ success: false, error: 'not_a_directory' });
        }

        const rawEntries = await fs.promises.readdir(absolutePath, { withFileTypes: true });
        const entries = [];

        for (const entry of rawEntries) {
            if (!entry || !entry.name || entry.name === '.' || entry.name === '..') {
                continue;
            }

            if (entry.isSymbolicLink()) {
                continue;
            }

            const isDirectory = entry.isDirectory();
            if (isDirectory && CODE_EDITOR_BLOCKED_DIRS.has(entry.name)) {
                continue;
            }

            const childAbsolute = path.join(absolutePath, entry.name);
            const childRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

            let childStat;
            try {
                childStat = await fs.promises.stat(childAbsolute);
            } catch (_error) {
                continue;
            }

            const childType = childStat.isDirectory() ? 'directory' : (childStat.isFile() ? 'file' : 'other');
            if (childType === 'other') {
                continue;
            }

            entries.push({
                name: entry.name,
                path: toCodeEditorPosixPath(childRelative),
                type: childType,
                size: childType === 'file' ? Number(childStat.size || 0) : null,
                modifiedAt: childStat.mtime?.toISOString?.() || null
            });
        }

        entries.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'directory' ? -1 : 1;
            }
            return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
        });

        return res.json({
            success: true,
            rootPath: CODE_EDITOR_ROOT,
            currentPath: relativePath,
            entries
        });
    } catch (error) {
        console.error('[Code Editor] Error listando directorio:', error);
        return res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
});

router.get('/code-editor/api/file', async (req, res) => {
    try {
        const requestedPath = String(req.query.path || '').trim();
        if (!requestedPath) {
            return res.status(400).json({ success: false, error: 'path_required' });
        }

        const { absolutePath, relativePath } = resolveCodeEditorPath(requestedPath);
        const fileStat = await fs.promises.stat(absolutePath);

        if (!fileStat.isFile()) {
            return res.status(400).json({ success: false, error: 'not_a_file' });
        }

        if (Number(fileStat.size || 0) > CODE_EDITOR_MAX_BYTES) {
            return res.status(413).json({ success: false, error: 'file_too_large' });
        }

        const buffer = await fs.promises.readFile(absolutePath);
        if (isLikelyBinary(buffer)) {
            return res.status(415).json({ success: false, error: 'binary_file_not_supported' });
        }

        return res.json({
            success: true,
            path: relativePath,
            content: buffer.toString('utf8'),
            size: Number(fileStat.size || 0),
            modifiedAt: fileStat.mtime?.toISOString?.() || null
        });
    } catch (error) {
        console.error('[Code Editor] Error leyendo archivo:', error);
        const statusCode = error.code === 'ENOENT' ? 404 : (error.statusCode || 500);
        return res.status(statusCode).json({ success: false, error: error.message });
    }
});

router.post('/code-editor/api/file', async (req, res) => {
    try {
        const requestedPath = String(req.body?.path || '').trim();
        const content = req.body?.content;

        if (!requestedPath) {
            return res.status(400).json({ success: false, error: 'path_required' });
        }

        if (typeof content !== 'string') {
            return res.status(400).json({ success: false, error: 'content_must_be_string' });
        }

        const payloadBytes = Buffer.byteLength(content, 'utf8');
        if (payloadBytes > CODE_EDITOR_MAX_BYTES) {
            return res.status(413).json({ success: false, error: 'content_too_large' });
        }

        const { absolutePath, relativePath } = resolveCodeEditorPath(requestedPath);
        const parentPath = path.dirname(absolutePath);
        const parentStat = await fs.promises.stat(parentPath);
        if (!parentStat.isDirectory()) {
            return res.status(400).json({ success: false, error: 'invalid_parent_directory' });
        }

        let existingIsBinary = false;
        try {
            const existingStat = await fs.promises.stat(absolutePath);
            if (existingStat.isDirectory()) {
                return res.status(400).json({ success: false, error: 'cannot_overwrite_directory' });
            }

            if (existingStat.isFile() && Number(existingStat.size || 0) <= CODE_EDITOR_MAX_BYTES) {
                const existingBuffer = await fs.promises.readFile(absolutePath);
                existingIsBinary = isLikelyBinary(existingBuffer);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error;
            }
        }

        if (existingIsBinary) {
            return res.status(415).json({ success: false, error: 'binary_file_not_supported' });
        }

        await fs.promises.writeFile(absolutePath, content, 'utf8');
        const updatedStat = await fs.promises.stat(absolutePath);

        return res.json({
            success: true,
            path: relativePath,
            size: Number(updatedStat.size || 0),
            modifiedAt: updatedStat.mtime?.toISOString?.() || null
        });
    } catch (error) {
        console.error('[Code Editor] Error guardando archivo:', error);
        const statusCode = error.code === 'ENOENT' ? 404 : (error.statusCode || 500);
        return res.status(statusCode).json({ success: false, error: error.message });
    }
});

router.get('/code-editor/vscode/status', async (_req, res) => {
    try {
        const status = await getCodeServerStatus();
        return res.json({
            success: true,
            ...status,
            host: CODE_SERVER_HOST,
            port: CODE_SERVER_PORT,
            containerName: CODE_SERVER_CONTAINER_NAME,
            serviceName: CODE_SERVER_SERVICE_NAME,
            workspaceRoot: CODE_SERVER_WORKSPACE_ROOT,
            composeFile: CODE_SERVER_COMPOSE_FILE,
            proxyPath: `${CODE_SERVER_PROXY_PREFIX}/`,
            autoStart: CODE_SERVER_AUTO_START
        });
    } catch (error) {
        console.error('[Code Server] Error consultando status:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/code-editor/vscode/start', async (req, res) => {
    try {
        const forceRecreate = req.body?.force === true || String(req.body?.force || '').trim() === '1';
        await startCodeServerContainer({ forceRecreate });
        const status = await waitForCodeServerRunning(45000);

        return res.json({
            success: status.running,
            message: status.running
                ? 'Code Server iniciado correctamente.'
                : 'Code Server no alcanzo estado running dentro del timeout.',
            ...status,
            proxyPath: `${CODE_SERVER_PROXY_PREFIX}/`
        });
    } catch (error) {
        console.error('[Code Server] Error iniciando container:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/code-editor/vscode/restart', async (_req, res) => {
    try {
        await startCodeServerContainer({ forceRecreate: true });
        const status = await waitForCodeServerRunning(60000);

        return res.json({
            success: status.running,
            message: status.running
                ? 'Code Server reiniciado correctamente.'
                : 'Code Server no alcanzo estado running despues de restart.',
            ...status,
            proxyPath: `${CODE_SERVER_PROXY_PREFIX}/`
        });
    } catch (error) {
        console.error('[Code Server] Error reiniciando container:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/code-editor/vscode/stop', async (_req, res) => {
    try {
        await stopCodeServerContainer();
        const status = await getCodeServerStatus();

        return res.json({
            success: true,
            message: 'Code Server detenido.',
            ...status,
            proxyPath: `${CODE_SERVER_PROXY_PREFIX}/`
        });
    } catch (error) {
        console.error('[Code Server] Error deteniendo container:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.use('/code-editor/vscode/ide', async (req, res) => {
    try {
        const status = await ensureCodeServerRunning();
        if (!status.running) {
            return res.status(503).send('Code Server container is offline. Use Start from the dashboard panel.');
        }

        return proxyCodeServerHttp(req, res);
    } catch (error) {
        console.error('[Code Server] HTTP proxy error:', error);
        return res.status(502).send(`Code Server proxy failed: ${error.message}`);
    }
});

router.get('/minidisc-generator', (req, res) => {
    const checkoutStatus = String(req.query.checkout || '').trim().toLowerCase();
    let checkoutFlash = null;

    if (checkoutStatus === 'success') {
        checkoutFlash = {
            type: 'success',
            message: 'Pago completado. La orden del Mini-Disc fue registrada exitosamente.'
        };
    } else if (checkoutStatus === 'success-email-warning') {
        checkoutFlash = {
            type: 'warn',
            message: 'Pago completado, pero el email de confirmacion no se pudo enviar automaticamente.'
        };
    } else if (checkoutStatus === 'cancel') {
        checkoutFlash = {
            type: 'warn',
            message: 'Checkout cancelado. Tu carrito sigue guardado.'
        };
    } else if (checkoutStatus === 'missing-cart') {
        checkoutFlash = {
            type: 'error',
            message: 'No hay un carrito listo para checkout. Agrega tracks primero.'
        };
    }

    res.render('tools/minidisc-generator', {
        title: 'Mini-Disc Generator - El Inmortal 2 Dashboard',
        spotifyConfigured: isSpotifyConfigured(),
        defaultArtistFilter: normalizeSpotifyArtistFilter(),
        unitPrice: MINI_DISC_GENERATOR_UNIT_PRICE,
        checkoutFlash
    });
});

router.get('/minidisc-generator/search', async (req, res) => {
    const query = String(req.query.q || '').trim();
    const artistFilter = normalizeSpotifyArtistFilter(req.query.artist);
    const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 25);

    if (!isSpotifyConfigured()) {
        return res.status(503).json({
            success: false,
            error: 'spotify_not_configured'
        });
    }

    if (query.length < 2) {
        return res.status(400).json({
            success: false,
            error: 'query_too_short'
        });
    }

    const result = await searchSpotifyTracks({
        query,
        limit,
        artistFilter
    });

    if (!result.success) {
        return res.status(502).json(result);
    }

    return res.json(result);
});

router.post('/minidisc-generator/checkout/prepare', async (req, res) => {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const fullName = normalizePersonName(req.body.fullName || req.body.full_name || req.body.name);
        const country = String(req.body.country || '').trim();
        const cartItems = normalizeMiniDiscGeneratorCartItems(req.body.cartItems || req.body.items);
        const summary = getMiniDiscGeneratorCartSummary(cartItems);

        if (!isValidEmailAddress(email)) {
            return res.status(400).json({ success: false, error: 'invalid_email' });
        }

        if (!fullName) {
            return res.status(400).json({ success: false, error: 'missing_full_name' });
        }

        if (!country) {
            return res.status(400).json({ success: false, error: 'missing_country' });
        }

        if (!cartItems.length || summary.itemCount <= 0) {
            return res.status(400).json({ success: false, error: 'empty_cart' });
        }

        await ensureLandingLeadsTable();

        const userResult = await registerOrUpdateLead({
            email,
            fullName,
            country,
            ipAddress: req.ip,
            userAgent: String(req.headers['user-agent'] || '').slice(0, 255),
            sourceLabel: 'tools_minidisc_generator'
        });

        if (!req.session) {
            return res.status(500).json({ success: false, error: 'session_unavailable' });
        }

        req.session[MINI_DISC_GENERATOR_CART_SESSION_KEY] = {
            userId: userResult.userId,
            email,
            fullName,
            country,
            cartItems,
            itemCount: summary.itemCount,
            totalAmount: Number(summary.totalAmount.toFixed(2)),
            currency: summary.currency,
            preparedAt: new Date().toISOString()
        };

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error('[MiniDisc Generator] Error guardando session checkout:', sessionError);
                return res.status(500).json({ success: false, error: 'session_save_failed' });
            }

            return res.json({
                success: true,
                checkoutUrl: '/tools/minidisc-generator/checkout',
                summary
            });
        });
    } catch (error) {
        console.error('[MiniDisc Generator] Error preparando checkout:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/minidisc-generator/checkout', (req, res) => {
    const checkoutState = req.session?.[MINI_DISC_GENERATOR_CART_SESSION_KEY];
    if (!checkoutState || !Array.isArray(checkoutState.cartItems) || checkoutState.cartItems.length === 0) {
        return res.redirect('/tools/minidisc-generator?checkout=missing-cart');
    }

    const paypalConfig = getPayPalConfig();
    const paypalConfigured = Boolean(paypalConfig.clientId && process.env.PAYPAL_SECRET);

    res.render('tools/minidisc-generator-checkout', {
        title: 'Mini-Disc Checkout - El Inmortal 2 Dashboard',
        checkoutState,
        checkoutStateJson: JSON.stringify(checkoutState).replace(/</g, '\\u003c'),
        paypalConfigured,
        paypalClientId: paypalConfig.clientId || '',
        paypalMode: paypalConfig.mode || 'sandbox'
    });
});

router.post('/minidisc-generator/checkout/create-order', async (req, res) => {
    try {
        const checkoutState = req.session?.[MINI_DISC_GENERATOR_CART_SESSION_KEY];
        if (!checkoutState || !Array.isArray(checkoutState.cartItems) || checkoutState.cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'checkout_state_missing' });
        }

        if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_SECRET) {
            return res.status(503).json({ success: false, error: 'paypal_not_configured' });
        }

        const baseUrl = String(process.env.BASE_URL || 'https://ei2.galantealx.com').trim();
        const orderResult = await createPayPalCartOrder({
            customerEmail: checkoutState.email,
            customerName: checkoutState.fullName,
            cartItems: checkoutState.cartItems,
            currency: checkoutState.currency || 'USD',
            returnUrl: `${baseUrl}/tools/minidisc-generator/checkout/success`,
            cancelUrl: `${baseUrl}/tools/minidisc-generator/checkout/cancel`
        });

        if (!orderResult.success) {
            return res.status(502).json(orderResult);
        }

        checkoutState.pendingOrderId = orderResult.orderId;
        req.session[MINI_DISC_GENERATOR_CART_SESSION_KEY] = checkoutState;

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error('[MiniDisc Generator] Error guardando orden en session:', sessionError);
                return res.status(500).json({ success: false, error: 'session_save_failed' });
            }

            return res.json({
                success: true,
                orderId: orderResult.orderId
            });
        });
    } catch (error) {
        console.error('[MiniDisc Generator] Error creando orden de checkout:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.post('/minidisc-generator/checkout/capture-order', async (req, res) => {
    try {
        const checkoutState = req.session?.[MINI_DISC_GENERATOR_CART_SESSION_KEY];
        if (!checkoutState || !Array.isArray(checkoutState.cartItems) || checkoutState.cartItems.length === 0) {
            return res.status(400).json({ success: false, error: 'checkout_state_missing' });
        }

        const orderId = String(req.body.orderId || '').trim();
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'order_id_required' });
        }

        await ensureLandingLeadsTable();

        const captureResult = await capturePayPalOrder(orderId);
        if (!captureResult.success) {
            return res.status(502).json({ success: false, error: captureResult.error || 'capture_failed' });
        }

        const amountValue = String(captureResult.amount || checkoutState.totalAmount || 0).trim() || '0.00';
        const amountCurrency = String(captureResult.currency || checkoutState.currency || 'USD').trim() || 'USD';

        await run(
            `UPDATE landing_email_leads
             SET paypal_order_id = ?,
                 paypal_payment_status = ?,
                 paypal_payer_email = ?,
                 paypal_amount_value = ?,
                 paypal_amount_currency = ?,
                 paypal_capture_id = ?,
                 interested_in_minidisc = 1
             WHERE id = ?`,
            [
                captureResult.orderId,
                'captured',
                captureResult.payerEmail || checkoutState.email,
                amountValue,
                amountCurrency,
                captureResult.captureId || null,
                checkoutState.userId
            ]
        );

        await ensureMiniDiscGeneratorOrderItemsTable();
        await run(
            'DELETE FROM minidisc_generator_order_items WHERE paypal_order_id = ?',
            [captureResult.orderId]
        );

        for (const item of checkoutState.cartItems) {
            const quantity = Math.min(Math.max(Number(item?.qty) || 1, 1), 25);
            const unitPrice = Number(item?.unitPrice);
            const normalizedUnitPrice = Number.isFinite(unitPrice) && unitPrice > 0
                ? unitPrice
                : MINI_DISC_GENERATOR_UNIT_PRICE;

            await run(
                `INSERT INTO minidisc_generator_order_items
                 (lead_id, paypal_order_id, paypal_capture_id, track_id, track_title, track_artists,
                  track_cover_url, spotify_url, quantity, unit_price, currency)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    checkoutState.userId,
                    captureResult.orderId,
                    captureResult.captureId || null,
                    String(item?.id || '').trim() || 'custom-track',
                    String(item?.title || 'Mini-Disc Personalizado').trim().slice(0, 255),
                    String(item?.artistsLabel || '').trim().slice(0, 255) || null,
                    String(item?.cover || '').trim().slice(0, 1000) || null,
                    String(item?.spotifyUrl || '').trim().slice(0, 1000) || null,
                    quantity,
                    normalizedUnitPrice.toFixed(2),
                    amountCurrency
                ]
            );
        }

        const nfcData = await saveNFCCode(checkoutState.userId);
        const userData = await getOne(
            'SELECT email, full_name FROM landing_email_leads WHERE id = ?',
            [checkoutState.userId]
        );

        const emailResult = await sendMiniDiscConfirmationEmail({
            to: userData?.email || checkoutState.email,
            name: normalizePersonName(userData?.full_name || checkoutState.fullName),
            orderId: captureResult.orderId,
            amount: amountValue,
            nfcCode: nfcData?.code,
            nfcLink: nfcData?.link
        });

        const notionSync = await syncMiniDiscOrderToNotion(checkoutState.userId);
        if (notionSync?.success) {
            console.log('[MiniDisc Generator] Notion actualizado para orden:', checkoutState.userId);
        }

        delete req.session[MINI_DISC_GENERATOR_CART_SESSION_KEY];

        req.session.save((sessionError) => {
            if (sessionError) {
                console.error('[MiniDisc Generator] Error limpiando session checkout:', sessionError);
            }

            const checkoutQuery = emailResult?.success ? 'success' : 'success-email-warning';
            return res.json({
                success: true,
                redirectUrl: `/tools/minidisc-generator?checkout=${checkoutQuery}&clearCart=1`
            });
        });
    } catch (error) {
        console.error('[MiniDisc Generator] Error capturando orden de checkout:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

router.get('/minidisc-generator/checkout/success', (_req, res) => {
    return res.redirect('/tools/minidisc-generator?checkout=success&clearCart=1');
});

router.get('/minidisc-generator/checkout/cancel', (_req, res) => {
    return res.redirect('/tools/minidisc-generator?checkout=cancel');
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

router.get('/minidisc-orders', async (req, res) => {
    try {
        await ensureLandingLeadsTable();
        const senderAddress = getMiniDiscSenderAddress();

        let normalizedOrders = (await getMiniDiscCapturedOrders()).map(normalizeMiniDiscOrder);

        const backfillCandidates = normalizedOrders
            .filter((order) => needsMiniDiscPayPalBackfill(order))
            .slice(0, 8);

        let backfilledCount = 0;
        for (const order of backfillCandidates) {
            const backfilled = await backfillMiniDiscOrderFromPayPal(order);
            if (backfilled) {
                backfilledCount += 1;
            }
        }

        if (backfilledCount > 0) {
            normalizedOrders = (await getMiniDiscCapturedOrders()).map(normalizeMiniDiscOrder);
        }

        const pendingOrders = normalizedOrders.filter((order) => !order.package_shipped);
        const completedOrders = normalizedOrders.filter((order) => order.package_shipped);
        const readyPendingOrders = pendingOrders.filter((order) => order.shipping_ready);
        const uspsDomesticReady = readyPendingOrders.filter((order) => order.usps_domestic).length;
        const uspsInternationalReady = readyPendingOrders.filter((order) => order.usps_international).length;
        const totalRevenue = normalizedOrders.reduce((sum, order) => sum + (order.amount_number || 0), 0);
        const pendingRevenue = pendingOrders.reduce((sum, order) => sum + (order.amount_number || 0), 0);

        res.render('tools/minidisc-orders', {
            title: 'Mini-Disc Orders - El Inmortal 2 Dashboard',
            pendingOrders,
            completedOrders,
            stats: {
                total: normalizedOrders.length,
                pending: pendingOrders.length,
                completed: completedOrders.length,
                readyPending: readyPendingOrders.length,
                uspsDomesticReady,
                uspsInternationalReady,
                totalRevenue,
                pendingRevenue
            },
            senderAddress,
            flash: parseMiniDiscFlash(req.query.flash)
        });
    } catch (error) {
        console.error('[MiniDisc Orders] Error cargando panel:', error);
        res.render('tools/minidisc-orders', {
            title: 'Mini-Disc Orders - El Inmortal 2 Dashboard',
            pendingOrders: [],
            completedOrders: [],
            stats: {
                total: 0,
                pending: 0,
                completed: 0,
                readyPending: 0,
                uspsDomesticReady: 0,
                uspsInternationalReady: 0,
                totalRevenue: 0,
                pendingRevenue: 0
            },
            senderAddress: getMiniDiscSenderAddress(),
            flash: {
                type: 'error',
                message: `No se pudo cargar el panel: ${error.message}`
            }
        });
    }
});

router.get('/minidisc-order', (_req, res) => {
    return res.redirect('/tools/minidisc-orders');
});

router.get('/minidisc-fulfillment', (_req, res) => {
    return res.redirect('/tools/minidisc-orders');
});

router.get('/minidisc-orders/labels/print', async (req, res) => {
    try {
        await ensureLandingLeadsTable();
        const senderAddress = getMiniDiscSenderAddress();

        let pendingOrders = (await getAll(
            `${MINI_DISC_ORDERS_BASE_SELECT}
             WHERE paypal_payment_status = 'captured' AND package_shipped = 0
             ORDER BY created_at DESC`
        )).map(normalizeMiniDiscOrder);

        const backfillCandidates = pendingOrders
            .filter((order) => needsMiniDiscPayPalBackfill(order))
            .slice(0, 20);

        let backfilledCount = 0;
        for (const order of backfillCandidates) {
            const backfilled = await backfillMiniDiscOrderFromPayPal(order);
            if (backfilled) {
                backfilledCount += 1;
            }
        }

        if (backfilledCount > 0) {
            pendingOrders = (await getAll(
                `${MINI_DISC_ORDERS_BASE_SELECT}
                 WHERE paypal_payment_status = 'captured' AND package_shipped = 0
                 ORDER BY created_at DESC`
            )).map(normalizeMiniDiscOrder);
        }

        const requestedIds = parseMiniDiscOrderIds(req.query.ids);
        if (requestedIds.length > 0) {
            const requestedSet = new Set(requestedIds);
            pendingOrders = pendingOrders.filter((order) => requestedSet.has(Number(order.id)));
        }

        const readyOrders = pendingOrders.filter((order) => order.shipping_ready);

        const totalAmount = readyOrders.reduce((sum, order) => sum + (order.amount_number || 0), 0);
        const domesticCount = readyOrders.filter((order) => order.usps_domestic).length;
        const internationalCount = readyOrders.filter((order) => order.usps_international).length;

        res.render('tools/minidisc-labels-print', {
            title: 'Print Labels - Mini-Disc Orders',
            orders: readyOrders,
            selectedCount: requestedIds.length,
            totalAmount,
            senderAddress,
            domesticCount,
            internationalCount,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('[MiniDisc Orders] Error generando labels para imprimir:', error);
        return redirectMiniDiscOrders(res, 'error', `No se pudieron generar labels: ${error.message}`);
    }
});

router.post('/minidisc-orders/:id/send-delay-email', async (req, res) => {
    const orderId = Number(req.params.id || 0);
    if (!orderId) {
        return redirectMiniDiscOrders(res, 'error', 'ID de orden invalido.');
    }

    try {
        await ensureLandingLeadsTable();

        const order = await getOne(
            `SELECT
                id,
                email,
                full_name,
                paypal_order_id,
                paypal_payment_status,
                package_shipped,
                minidisc_delay_email_sent,
                minidisc_delay_email_sent_at
             FROM landing_email_leads
             WHERE id = ?`,
            [orderId]
        );

        if (!order) {
            return redirectMiniDiscOrders(res, 'error', 'Orden no encontrada.');
        }

        if (order.paypal_payment_status !== 'captured') {
            return redirectMiniDiscOrders(res, 'error', 'Solo se permite aviso para pagos capturados.');
        }

        if (Number(order.package_shipped) === 1) {
            return redirectMiniDiscOrders(res, 'warn', 'La orden ya fue enviada. Usa Reenviar Email de envio.');
        }

        if (Number(order.minidisc_delay_email_sent) === 1 || order.minidisc_delay_email_sent_at) {
            return redirectMiniDiscOrders(res, 'warn', 'Ya se envio un aviso de retraso para esta orden.');
        }

        const emailResult = await sendMiniDiscDelayEmail({
            to: order.email,
            name: order.full_name,
            orderId: order.paypal_order_id
        });

        if (!emailResult.success) {
            return redirectMiniDiscOrders(
                res,
                'error',
                `No se pudo enviar aviso de retraso (${emailResult.error || 'error_desconocido'}).`
            );
        }

        await run(
            `UPDATE landing_email_leads
             SET minidisc_delay_email_sent = 1,
                 minidisc_delay_email_sent_at = COALESCE(minidisc_delay_email_sent_at, CURRENT_TIMESTAMP)
             WHERE id = ?`,
            [orderId]
        );

        return redirectMiniDiscOrders(
            res,
            'success',
            `Aviso de retraso enviado a ${order.email}.`
        );
    } catch (error) {
        console.error('[MiniDisc Orders] Error enviando aviso de retraso:', error);
        return redirectMiniDiscOrders(res, 'error', `No se pudo enviar aviso de retraso: ${error.message}`);
    }
});

router.post('/minidisc-orders/:id/complete', async (req, res) => {
    const orderId = Number(req.params.id || 0);
    const trackingNumber = String(req.body.tracking_number || '').trim();

    if (!orderId) {
        return redirectMiniDiscOrders(res, 'error', 'ID de orden invalido.');
    }

    if (!trackingNumber) {
        return redirectMiniDiscOrders(res, 'error', 'El tracking es obligatorio para completar la orden.');
    }

    try {
        await ensureLandingLeadsTable();

        const order = await getOne(
            `SELECT
                id,
                email,
                full_name,
                paypal_order_id,
                paypal_payment_status,
                package_shipped,
                tracking_number,
                nfc_unique_code,
                nfc_link
             FROM landing_email_leads
             WHERE id = ?`,
            [orderId]
        );

        if (!order) {
            return redirectMiniDiscOrders(res, 'error', 'Orden no encontrada.');
        }

        if (order.paypal_payment_status !== 'captured') {
            return redirectMiniDiscOrders(res, 'error', 'Solo se pueden completar ordenes con pago capturado.');
        }

        const wasShipped = Number(order.package_shipped) === 1;
        const previousTracking = String(order.tracking_number || '').trim();
        if (wasShipped && previousTracking === trackingNumber) {
            return redirectMiniDiscOrders(res, 'warn', 'La orden ya estaba completada con ese tracking.');
        }

        await run(
            `UPDATE landing_email_leads
             SET package_shipped = 1,
                 tracking_number = ?
             WHERE id = ?`,
            [trackingNumber, orderId]
        );

        const emailResult = await sendMiniDiscShippedEmail({
            to: order.email,
            name: order.full_name,
            orderId: order.paypal_order_id,
            trackingNumber,
            nfcCode: order.nfc_unique_code,
            nfcLink: order.nfc_link
        });

        const notionSync = await syncMiniDiscOrderToNotion(orderId);
        if (notionSync?.success) {
            console.log('[MiniDisc Orders] Notion actualizado para orden:', orderId);
        }

        if (!emailResult.success) {
            return redirectMiniDiscOrders(
                res,
                'warn',
                `Orden completada, pero el email no se pudo enviar (${emailResult.error || 'error_desconocido'}). Usa Reenviar Email.`
            );
        }

        return redirectMiniDiscOrders(
            res,
            'success',
            `Orden #${orderId} completada y notificacion enviada a ${order.email}.`
        );
    } catch (error) {
        console.error('[MiniDisc Orders] Error completando orden:', error);
        return redirectMiniDiscOrders(res, 'error', `No se pudo completar la orden: ${error.message}`);
    }
});

router.post('/minidisc-orders/:id/reopen', async (req, res) => {
    const orderId = Number(req.params.id || 0);
    if (!orderId) {
        return redirectMiniDiscOrders(res, 'error', 'ID de orden invalido.');
    }

    try {
        await ensureLandingLeadsTable();

        const order = await getOne(
            'SELECT id, paypal_payment_status FROM landing_email_leads WHERE id = ?',
            [orderId]
        );

        if (!order) {
            return redirectMiniDiscOrders(res, 'error', 'Orden no encontrada.');
        }

        if (order.paypal_payment_status !== 'captured') {
            return redirectMiniDiscOrders(res, 'error', 'La orden no tiene pago capturado.');
        }

        await run(
            `UPDATE landing_email_leads
             SET package_shipped = 0,
                 tracking_number = NULL
             WHERE id = ?`,
            [orderId]
        );

        const notionSync = await syncMiniDiscOrderToNotion(orderId);
        if (notionSync?.success) {
            console.log('[MiniDisc Orders] Notion actualizado al reabrir orden:', orderId);
        }

        return redirectMiniDiscOrders(res, 'success', `Orden #${orderId} movida a pendientes.`);
    } catch (error) {
        console.error('[MiniDisc Orders] Error reabriendo orden:', error);
        return redirectMiniDiscOrders(res, 'error', `No se pudo reabrir la orden: ${error.message}`);
    }
});

router.post('/minidisc-orders/:id/resend-email', async (req, res) => {
    const orderId = Number(req.params.id || 0);
    if (!orderId) {
        return redirectMiniDiscOrders(res, 'error', 'ID de orden invalido.');
    }

    try {
        await ensureLandingLeadsTable();

        const order = await getOne(
            `SELECT
                id,
                email,
                full_name,
                paypal_order_id,
                paypal_payment_status,
                package_shipped,
                tracking_number,
                nfc_unique_code,
                nfc_link
             FROM landing_email_leads
             WHERE id = ?`,
            [orderId]
        );

        if (!order) {
            return redirectMiniDiscOrders(res, 'error', 'Orden no encontrada.');
        }

        if (order.paypal_payment_status !== 'captured') {
            return redirectMiniDiscOrders(res, 'error', 'La orden no tiene pago capturado.');
        }

        if (Number(order.package_shipped) !== 1) {
            return redirectMiniDiscOrders(res, 'error', 'Solo se puede reenviar email para ordenes completas.');
        }

        const trackingNumber = String(order.tracking_number || '').trim();
        if (!trackingNumber) {
            return redirectMiniDiscOrders(res, 'error', 'No hay tracking guardado para esta orden.');
        }

        const emailResult = await sendMiniDiscShippedEmail({
            to: order.email,
            name: order.full_name,
            orderId: order.paypal_order_id,
            trackingNumber,
            nfcCode: order.nfc_unique_code,
            nfcLink: order.nfc_link
        });

        if (!emailResult.success) {
            return redirectMiniDiscOrders(
                res,
                'error',
                `No se pudo reenviar el email (${emailResult.error || 'error_desconocido'}).`
            );
        }

        return redirectMiniDiscOrders(res, 'success', `Email reenviado a ${order.email}.`);
    } catch (error) {
        console.error('[MiniDisc Orders] Error reenviando email:', error);
        return redirectMiniDiscOrders(res, 'error', `No se pudo reenviar el email: ${error.message}`);
    }
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

router.isCodeEditorUpgradeRequest = isCodeEditorUpgradeRequest;
router.handleCodeEditorUpgrade = handleCodeEditorUpgrade;

module.exports = router;
