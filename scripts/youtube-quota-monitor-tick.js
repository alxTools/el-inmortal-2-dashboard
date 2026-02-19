#!/usr/bin/env node

require('dotenv').config();

const { execSync } = require('child_process');
const {
    checkYoutubeApiQuotaAndStore,
    getYoutubeApiQuotaHistory
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

function disableWindowsScheduledTask(taskName) {
    if (process.platform !== 'win32') {
        return { ok: false, skipped: true, message: 'not_windows' };
    }

    try {
        execSync(`schtasks /Change /TN "${taskName}" /Disable`, {
            stdio: ['ignore', 'pipe', 'pipe']
        });
        return { ok: true, skipped: false, message: 'disabled' };
    } catch (error) {
        const stderr = String(error?.stderr || '').trim();
        const stdout = String(error?.stdout || '').trim();
        const message = stderr || stdout || error.message;
        return { ok: false, skipped: false, message: String(message).slice(0, 500) };
    }
}

async function main() {
    const args = process.argv.slice(2);
    const requestedBy = getArgValue(args, 'by', 'quota_monitor');
    const taskName = getArgValue(args, 'task-name', process.env.YT_QUOTA_MONITOR_TASK || 'ElInmortal2_YTQuotaMonitor');
    const keepRunning = hasFlag(args, 'keep-running');

    const check = await checkYoutubeApiQuotaAndStore({
        requestedBy,
        endpointLabel: 'channels.mine'
    });

    let taskAction = { ok: false, skipped: true, message: 'not_needed' };
    if (check.available && !keepRunning) {
        taskAction = disableWindowsScheduledTask(taskName);
    }

    const history = await getYoutubeApiQuotaHistory({ limit: 100 });

    console.log(JSON.stringify({
        check,
        taskName,
        keepRunning,
        taskAction,
        latestQuotaExceededAt: history.latestQuotaExceededAt,
        latestAvailableAt: history.latestAvailableAt,
        resetDetectedAt: history.resetDetectedAt
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('youtube-quota-monitor-tick error:', error.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        try {
            await closePool();
        } catch (error) {
            console.error('youtube-quota-monitor-tick close error:', error.message);
            process.exitCode = process.exitCode || 1;
        }
    });
