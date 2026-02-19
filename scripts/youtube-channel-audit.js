#!/usr/bin/env node

require('dotenv').config();

const {
    inspectYoutubeChannelAndStore,
    getYoutubeAuditDashboardData,
    applyYoutubeAuditUpdates,
    optimizeTopTrafficVideosAndStoreTargets,
    optimizeTopTrafficAndApplyUpdates,
    generateAndStoreYoutubeOpsDailyReport,
    sendYoutubeOpsDailyReportEmail
} = require('../src/utils/youtubeMetadataAudit');
const { closePool } = require('../src/config/database');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function hasFlag(args, name) {
    return args.includes(`--${name}`);
}

async function main() {
    const args = process.argv.slice(2);
    const command = (args[0] || 'status').toLowerCase();

    if (command === 'inspect') {
        const requestedBy = getArgValue(args, 'by', 'cli');
        const result = await inspectYoutubeChannelAndStore({ requestedBy });
        console.log('Inspect completed');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'update') {
        const runId = Number(getArgValue(args, 'run-id', 0));
        if (!runId) {
            throw new Error('run-id is required for update command');
        }

        const mode = getArgValue(args, 'mode', 'target_and_heuristic');
        const limit = Number(getArgValue(args, 'limit', 250)) || 250;
        const requestedBy = getArgValue(args, 'by', 'cli');
        const onlyNeedsFix = !hasFlag(args, 'all');
        const protectMainHeuristic = !hasFlag(args, 'allow-main-heuristic');

        const result = await applyYoutubeAuditUpdates({
            runId,
            mode,
            limit,
            requestedBy,
            onlyNeedsFix,
            protectMainHeuristic
        });

        console.log('Update completed');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'optimize-top') {
        const runId = Number(getArgValue(args, 'run-id', 0)) || null;
        const limit = Number(getArgValue(args, 'limit', 50)) || 50;
        const requestedBy = getArgValue(args, 'by', 'cli');
        const onlyNeedsFix = !hasFlag(args, 'include-ok');

        const result = await optimizeTopTrafficVideosAndStoreTargets({
            runId,
            limit,
            requestedBy,
            onlyNeedsFix
        });

        console.log('Top-traffic SEO optimization completed');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'optimize-top-and-update') {
        const runId = Number(getArgValue(args, 'run-id', 0)) || null;
        const limit = Number(getArgValue(args, 'limit', 50)) || 50;
        const requestedBy = getArgValue(args, 'by', 'cli');
        const onlyNeedsFix = !hasFlag(args, 'include-ok');

        const result = await optimizeTopTrafficAndApplyUpdates({
            runId,
            limit,
            requestedBy,
            onlyNeedsFix
        });

        console.log('Top-traffic SEO optimization + update completed');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'daily-report') {
        const requestedBy = getArgValue(args, 'by', 'cli');
        const reportDate = getArgValue(args, 'report-date', '');
        const from = getArgValue(args, 'from', '');
        const to = getArgValue(args, 'to', '');

        const result = await generateAndStoreYoutubeOpsDailyReport({
            requestedBy,
            reportDate,
            fromDate: from,
            toDate: to
        });

        console.log('Daily report generated and stored');
        console.log(JSON.stringify({
            reportDate: result.reportDate,
            totals: result.summary?.totals || {}
        }, null, 2));
        console.log('---');
        console.log(result.markdown);
        return;
    }

    if (command === 'daily-report-email') {
        const requestedBy = getArgValue(args, 'by', 'cli');
        const reportDate = getArgValue(args, 'report-date', '');
        const fromDate = getArgValue(args, 'from-date', '');
        const toDate = getArgValue(args, 'to-date', '');
        const to = getArgValue(args, 'to', process.env.YT_DAILY_REPORT_TO || '');
        const cc = getArgValue(args, 'cc', '');
        const bcc = getArgValue(args, 'bcc', '');
        const subject = getArgValue(args, 'subject', '');

        const result = await sendYoutubeOpsDailyReportEmail({
            requestedBy,
            reportDate,
            fromDate,
            toDate,
            to,
            cc,
            bcc,
            subject
        });

        console.log('Daily report email sent with PDF');
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    const runId = Number(getArgValue(args, 'run-id', 0)) || null;
    const data = await getYoutubeAuditDashboardData(runId, 50);
    console.log(JSON.stringify(data, null, 2));
}

main()
    .catch((error) => {
        console.error('youtube-channel-audit error:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closePool();
        } catch (error) {
            console.error('youtube-channel-audit close error:', error.message);
            process.exitCode = process.exitCode || 1;
        }
    });
