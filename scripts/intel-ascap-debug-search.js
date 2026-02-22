#!/usr/bin/env node

require('dotenv').config();

const { chromium } = require('playwright-core');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

async function main() {
    const args = process.argv.slice(2);
    const title = getArgValue(args, 'title', 'toda para mi');
    const writer = getArgValue(args, 'writer', 'alex alberto serrano olivencia');
    const headless = getArgValue(args, 'headless', 'false') === 'true';

    const browser = await chromium.launch({
        headless,
        executablePath: process.env.ASCAP_BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'
    });

    const context = await browser.newContext({
        viewport: { width: 1366, height: 900 },
        userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    const events = [];

    page.on('request', (req) => {
        const url = req.url();
        if (url.includes('ace-api.ascap.com')) {
            events.push({
                kind: 'request',
                method: req.method(),
                url,
                post: req.postData(),
                headers: req.headers()
            });
        }
    });

    page.on('response', async (res) => {
        const url = res.url();
        if (url.includes('ace-api.ascap.com')) {
            let text = '';
            try {
                text = (await res.text()).slice(0, 1200);
            } catch (_) {
                text = '';
            }
            events.push({
                kind: 'response',
                status: res.status(),
                url,
                text
            });
        }
    });

    await page.goto('https://www.ascap.com/repertory', { waitUntil: 'networkidle', timeout: 120000 });
    await page.waitForTimeout(7000);

    const result = await page.evaluate(async ({ titleText, writerText }) => {
        function findSearchVm() {
            const nodes = Array.from(document.querySelectorAll('*'));
            for (const node of nodes) {
                const vm = node.__vue__;
                if (!vm || !vm.$options || !vm.$options.methods) continue;
                if (vm.$options.methods.getDoubleResults) return vm;
            }
            return null;
        }

        const target = findSearchVm();
        if (!target) return { found: false };

        try {
            if (typeof target.$recaptchaLoaded === 'function') {
                await target.$recaptchaLoaded();
            }
            const token = typeof target.$recaptcha === 'function'
                ? await target.$recaptcha('multi_search')
                : null;
            const payload = [
                { type: 'title', value: titleText },
                { type: 'writer', value: writerText }
            ];
            const response = await target.getDoubleResults(payload, 1, false, 'SVW', token);
            const data = response && response.data ? response.data : response;
            return {
                found: true,
                tokenLength: token ? token.length : 0,
                dataPreview: JSON.stringify(data).slice(0, 1200)
            };
        } catch (error) {
            return {
                found: true,
                error: String(error && error.message ? error.message : error)
            };
        }
    }, { titleText: title, writerText: writer });

    console.log(JSON.stringify({ result, events }, null, 2));
    await browser.close();
}

main().catch((error) => {
    console.error('intel-ascap-debug-search error:', error.message);
    process.exitCode = 1;
});
