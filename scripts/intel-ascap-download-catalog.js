#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { getIntelCredential } = require('../src/utils/intelCredentials');
const { logStatusUpdate } = require('../src/utils/statusUpdates');
const { closePool } = require('../src/config/database');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function resolveBrowserPath() {
    const explicit = String(process.env.ASCAP_BROWSER_PATH || '').trim();
    if (explicit) return explicit;
    if (process.platform === 'win32') {
        return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }
    return '/usr/bin/google-chrome';
}

async function main() {
    const args = process.argv.slice(2);
    const headless = getArgValue(args, 'headless', 'false') === 'true';
    const requestedBy = getArgValue(args, 'by', 'opencode');

    const downloadsRoot = path.join(process.cwd(), 'downloads', 'ascap');
    fs.mkdirSync(downloadsRoot, { recursive: true });

    await logStatusUpdate({
        message: 'Iniciando descarga del catalogo completo ASCAP desde Member Access.',
        sourceLabel: 'ascap_download',
        severity: 'info'
    });

    const cred = await getIntelCredential('ascap', 'galantealx');
    const browserPath = resolveBrowserPath();
    const browser = await chromium.launch({
        headless,
        executablePath: browserPath,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        acceptDownloads: true,
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    let downloadPath = null;

    try {
        await page.goto('https://www.ascap.com/member-access#works/download', {
            waitUntil: 'networkidle',
            timeout: 120000
        });
        await page.waitForTimeout(4000);

        const loginEmail = page.locator('input[type="email"], input[name*="user" i], input[id*="user" i]').first();
        const loginPassword = page.locator('input[type="password"]').first();

        if (await loginEmail.count() && await loginPassword.count()) {
            await loginEmail.fill(cred.username);
            await loginPassword.fill(cred.password);
            const submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
            if (await submitBtn.count()) {
                await Promise.all([
                    page.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(() => null),
                    submitBtn.click()
                ]);
            }
            await page.waitForTimeout(4000);
        }

        await page.goto('https://www.ascap.com/member-access#works/download', {
            waitUntil: 'networkidle',
            timeout: 120000
        });
        await page.waitForTimeout(4000);

        const downloadPromise = page.waitForEvent('download', { timeout: 60000 }).catch(() => null);
        const downloadButton = page.getByRole('button', { name: /download/i }).first();
        const downloadLink = page.getByRole('link', { name: /download/i }).first();

        if (await downloadButton.count()) {
            await downloadButton.click({ force: true });
        } else if (await downloadLink.count()) {
            await downloadLink.click({ force: true });
        }

        const download = await downloadPromise;
        if (download) {
            const suggested = download.suggestedFilename();
            const target = path.join(downloadsRoot, suggested || `ascap-catalog-${Date.now()}.zip`);
            await download.saveAs(target);
            downloadPath = target;
        } else {
            await page.screenshot({ path: path.join(process.cwd(), 'logs', 'ascap-download-state.png'), fullPage: true }).catch(() => null);
        }
    } finally {
        await browser.close().catch(() => null);
    }

    if (downloadPath) {
        await logStatusUpdate({
            message: `ASCAP catalog descargado: ${downloadPath}`,
            sourceLabel: 'ascap_download',
            severity: 'info'
        });
    } else {
        await logStatusUpdate({
            message: 'ASCAP download no genero archivo. Revisar screenshot logs/ascap-download-state.png.',
            sourceLabel: 'ascap_download',
            severity: 'warning'
        });
    }
}

main()
    .catch((error) => {
        console.error('intel-ascap-download-catalog error:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closePool();
        } catch (error) {
            console.error('closePool error:', error.message);
            process.exitCode = process.exitCode || 1;
        }
    });
