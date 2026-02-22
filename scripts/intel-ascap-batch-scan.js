#!/usr/bin/env node

require('dotenv').config();

const { chromium } = require('playwright-core');
const { getAll, run, closePool } = require('../src/config/database');
const { getIntelCredential } = require('../src/utils/intelCredentials');
const { startMissionRun, finishMissionRun } = require('../src/utils/intelAgentRuntime');

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

function extractWriterNames(row) {
    const writers = [];
    const listCandidates = [
        row?.writers,
        row?.writerList,
        row?.workWriters,
        row?.workCreditorsList,
        row?.workCreditorsTable,
        row?.creditors
    ];

    for (const candidate of listCandidates) {
        if (!Array.isArray(candidate)) continue;
        for (const item of candidate) {
            if (!item) continue;
            if (typeof item === 'string') {
                if (item.trim()) writers.push(item.trim());
                continue;
            }
            const name = item.fullName || item.name || item.writerName || item.creditorName || item.partyName;
            if (name && String(name).trim()) writers.push(String(name).trim());
        }
    }

    return [...new Set(writers)].slice(0, 50);
}

function extractPublishers(row) {
    const publishers = [];
    const listCandidates = [row?.publishers, row?.publisherList, row?.workPublishers];

    for (const candidate of listCandidates) {
        if (!Array.isArray(candidate)) continue;
        for (const item of candidate) {
            if (!item) continue;
            if (typeof item === 'string') {
                if (item.trim()) publishers.push(item.trim());
                continue;
            }
            const name = item.fullName || item.name || item.publisherName || item.partyName;
            if (name && String(name).trim()) publishers.push(String(name).trim());
        }
    }

    return [...new Set(publishers)].slice(0, 50);
}

function rowTitle(row) {
    return String(
        row?.workTitle ||
        row?.title ||
        row?.workName ||
        row?.songTitle ||
        ''
    ).trim();
}

async function main() {
    const args = process.argv.slice(2);
    const requestedBy = getArgValue(args, 'by', 'opencode');
    const limit = Math.max(1, Math.min(50, Number(getArgValue(args, 'limit', 21)) || 21));
    const writerHint = String(
        getArgValue(args, 'writer', process.env.ASCAP_DEFAULT_WRITER || 'ALEX ALBERTO SERRANO OLIVENCIA')
    ).trim();

    const { mission, runId } = await startMissionRun({
        missionType: 'rights_registry_mapper',
        requestedBy,
        summary: { requestedBy, limit, writerHint }
    });

    let browser;
    try {
        const cred = await getIntelCredential('ascap', 'galantealx');
        const browserPath = resolveBrowserPath();
        const tracks = await getAll(
            `SELECT id, track_number, title
             FROM tracks
             ORDER BY track_number ASC
             LIMIT ${limit}`
        );

        browser = await chromium.launch({
            headless: false,
            executablePath: browserPath,
            args: ['--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        await page.goto('https://www.ascap.com/repertory', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForTimeout(3000);

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
        }

        await page.waitForTimeout(4000);
        await page.goto('https://www.ascap.com/repertory#/ace/search/title/toda%20para%20mi', {
            waitUntil: 'networkidle',
            timeout: 120000
        });
        await page.waitForTimeout(6000);

        let stored = 0;
        for (const track of tracks) {
            if (!track?.title) continue;
            const result = await page.evaluate(
                async ({ titleText, writerText }) => {
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
                    try {
                        const response = await target.getDoubleResults(payload, 1, false, 'SVW', token);
                        const data = response && response.data ? response.data : response;
                        return { found: true, tokenLength: token ? token.length : 0, data };
                    } catch (error) {
                        return { found: true, error: String(error && error.message ? error.message : error) };
                    }
                },
                { titleText: track.title, writerText: writerHint }
            );

            if (!result?.found || result?.error) {
                await run(
                    `INSERT INTO rights_catalog_works
                     (mission_id, mission_run_id, society, work_title, writer_name, status_label, source_label, raw_json)
                     VALUES (?, ?, 'ASCAP', ?, ?, ?, ?, CAST(? AS JSON))`,
                    [
                        mission.id,
                        runId,
                        track.title,
                        writerHint,
                        'error',
                        'ascap_batch_search_error',
                        JSON.stringify({ trackId: track.id, trackNumber: track.track_number, error: result?.error })
                    ]
                );
                continue;
            }

            const rows = Array.isArray(result.data?.result) ? result.data.result : [];
            for (const row of rows.slice(0, 50)) {
                const workTitle = rowTitle(row) || track.title;
                const writers = extractWriterNames(row).join(' | ') || writerHint;
                const publishers = extractPublishers(row).join(' | ') || null;
                const externalId = String(row?.workId || row?.workID || row?.id || '').trim() || null;

                await run(
                    `INSERT INTO rights_catalog_works
                     (mission_id, mission_run_id, society, work_title, work_identifier, writer_name, publisher_name, status_label, source_label, raw_json)
                     VALUES (?, ?, 'ASCAP', ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
                    [
                        mission.id,
                        runId,
                        workTitle,
                        externalId,
                        writers,
                        publishers,
                        'candidate',
                        'ascap_batch_search',
                        JSON.stringify({
                            trackId: track.id,
                            trackNumber: track.track_number,
                            trackTitle: track.title,
                            queryWriter: writerHint,
                            raw: row
                        })
                    ]
                );
                stored += 1;
            }
        }

        await finishMissionRun({
            missionId: mission.id,
            runId,
            status: 'success',
            summary: { requestedBy, limit, stored, writerHint },
            errorText: null
        });

        console.log(JSON.stringify({ status: 'success', stored, runId }, null, 2));
    } catch (error) {
        await finishMissionRun({
            missionId: mission.id,
            runId,
            status: 'error',
            summary: { requestedBy, limit, writerHint },
            errorText: String(error.message || 'ascap_batch_failed').slice(0, 1200)
        });
        throw error;
    } finally {
        if (browser) {
            await browser.close().catch(() => null);
        }
    }
}

main()
    .catch((error) => {
        console.error('intel-ascap-batch-scan error:', error.message);
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
