#!/usr/bin/env node

require('dotenv').config();

const path = require('path');
const { chromium } = require('playwright-core');
const { getOne, run, closePool } = require('../src/config/database');
const { getIntelCredential } = require('../src/utils/intelCredentials');

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

function extractCandidateBlocks(text, titleHint) {
    const lines = String(text || '')
        .split('\n')
        .map((x) => x.trim())
        .filter(Boolean);

    const normalizedHint = String(titleHint || '').trim().toLowerCase();
    if (!normalizedHint) return [];

    const out = [];
    for (let i = 0; i < lines.length; i += 1) {
        if (!lines[i].toLowerCase().includes(normalizedHint)) continue;
        const block = lines.slice(Math.max(0, i - 2), Math.min(lines.length, i + 12));
        out.push(block.join(' | '));
    }

    return [...new Set(out)].slice(0, 25);
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

function rowTitle(row) {
    return String(
        row?.workTitle ||
        row?.title ||
        row?.workName ||
        row?.songTitle ||
        ''
    ).trim();
}

async function ensureMissionAndRun(requestedBy) {
    const mission = await getOne(
        `SELECT id FROM intel_agent_missions WHERE mission_type = 'rights_registry_mapper' LIMIT 1`
    );

    if (!mission?.id) {
        throw new Error('rights_registry_mapper mission not found. Run npm run intel:seed-missions first.');
    }

    const start = new Date();
    const insert = await run(
        `INSERT INTO intel_agent_runs (mission_id, run_status, summary_json, error_text, started_at)
         VALUES (?, 'running', CAST(? AS JSON), NULL, ?)`,
        [mission.id, JSON.stringify({ requestedBy }), start]
    );

    return {
        missionId: mission.id,
        runId: insert.lastID || insert.insertId,
        startedAt: start
    };
}

async function finishRun({ runId, status, summary, errorText }) {
    await run(
        `UPDATE intel_agent_runs
         SET run_status = ?, summary_json = CAST(? AS JSON), error_text = ?, finished_at = NOW()
         WHERE id = ?`,
        [status, JSON.stringify(summary || {}), errorText || null, runId]
    );
}

async function main() {
    const args = process.argv.slice(2);
    const url = getArgValue(args, 'url', 'https://www.ascap.com/repertory');
    const titleHint = getArgValue(args, 'title-hint', 'toda para mi');
    const writerHint = getArgValue(args, 'writer-hint', 'ALEX ALBERTO SERRANO OLIVENCIA');
    const requestedBy = getArgValue(args, 'by', 'opencode');

    const { missionId, runId } = await ensureMissionAndRun(requestedBy);

    let browser;
    try {
        const cred = await getIntelCredential('ascap', 'galantealx');
        const browserPath = resolveBrowserPath();

        browser = await chromium.launch({
            headless: true,
            executablePath: browserPath,
            args: ['--disable-blink-features=AutomationControlled']
        });

        const context = await browser.newContext({
            viewport: { width: 1366, height: 900 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36'
        });

        const page = await context.newPage();
        await page.goto('https://www.ascap.com/repertory', { waitUntil: 'domcontentloaded', timeout: 120000 });

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

        const agreeButton = page.getByRole('button', { name: /I\s*Agree/i }).first();
        if (await agreeButton.count()) {
            await agreeButton.click().catch(() => null);
            await page.waitForTimeout(1200);
        }

        await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch(async () => {
            await page.waitForTimeout(7000);
        });
        await page.waitForTimeout(6000);

        const apiPayload = {
            limit: 100,
            page: 1,
            universe: 'IncludeATT',
            socUniverse: 'SVW',
            searchType1: 'title',
            searchType2: 'wrtName',
            searchValue1: titleHint,
            searchValue2: writerHint,
            gCaptcha: null
        };

        const apiResult = await (async () => {
            const endpoint = 'https://ace-api.ascap.com/api/wservice/MobileWeb/service/ace/api/v3.0/search';
            try {
                const response = await context.request.post(endpoint, {
                    headers: {
                        'Content-Type': 'application/json',
                        Origin: 'https://www.ascap.com',
                        Referer: 'https://www.ascap.com/repertory'
                    },
                    data: apiPayload,
                    timeout: 120000
                });

                let json = null;
                let text = null;

                try {
                    json = await response.json();
                } catch (_) {
                    text = await response.text().catch(() => null);
                }

                return {
                    status: response.status(),
                    ok: response.ok(),
                    json,
                    text: text ? String(text).slice(0, 400) : null
                };
            } catch (error) {
                return {
                    status: 0,
                    ok: false,
                    json: null,
                    text: String(error?.message || 'api_request_failed').slice(0, 400)
                };
            }
        })();

        let candidateCount = 0;
        if (apiResult?.ok && apiResult?.json && Array.isArray(apiResult.json.result)) {
            for (const row of apiResult.json.result) {
                const title = rowTitle(row) || titleHint;
                const writers = extractWriterNames(row);
                const externalId = String(row?.workId || row?.workID || row?.id || '').trim() || null;

                await run(
                    `INSERT INTO rights_catalog_works
                     (mission_id, mission_run_id, society, work_title, work_identifier, writer_name, status_label, source_label, raw_json)
                     VALUES (?, ?, 'ASCAP', ?, ?, ?, ?, ?, CAST(? AS JSON))`,
                    [
                        missionId,
                        runId,
                        title,
                        externalId,
                        writers.join(' | ') || writerHint,
                        'candidate',
                        'ascap_api_browser_context',
                        JSON.stringify({ sourceUrl: url, apiPayload, row })
                    ]
                );
                candidateCount += 1;
            }
        }

        const bodyText = await page.locator('body').innerText();
        const candidates = extractCandidateBlocks(bodyText, titleHint);

        for (const candidate of candidates) {
            await run(
                `INSERT INTO rights_catalog_works
                 (mission_id, mission_run_id, society, work_title, writer_name, status_label, source_label, raw_json)
                 VALUES (?, ?, 'ASCAP', ?, ?, ?, ?, CAST(? AS JSON))`,
                [
                    missionId,
                    runId,
                    titleHint,
                    writerHint,
                    'candidate',
                    'ascap_repertory_scan',
                    JSON.stringify({
                        sourceUrl: url,
                        extractedBlock: candidate
                    })
                ]
            );
        }
        candidateCount += candidates.length;

        const screenshotDir = path.join(process.cwd(), 'logs');
        const screenshotPath = path.join(screenshotDir, `ascap-scan-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => null);

        const summary = {
            sourceUrl: url,
            titleHint,
            writerHint,
            candidateCount,
            apiStatus: apiResult?.status || null,
            apiMessage: apiResult?.text || apiResult?.json?.message || null,
            screenshotPath
        };

        await finishRun({
            runId,
            status: 'success',
            summary,
            errorText: null
        });

        console.log(JSON.stringify({
            status: 'success',
            runId,
            missionId,
            ...summary
        }, null, 2));
    } catch (error) {
        const msg = String(error.message || 'scan_failed').slice(0, 1000);
        await finishRun({
            runId,
            status: 'error',
            summary: { sourceUrl: url, titleHint, writerHint },
            errorText: msg
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
        console.error('intel-ascap-scan-once error:', error.message);
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
