#!/usr/bin/env node

require('dotenv').config();

const { logStatusUpdate } = require('../src/utils/statusUpdates');
const { closePool } = require('../src/config/database');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

async function main() {
    const args = process.argv.slice(2);
    const message = String(getArgValue(args, 'message', '') || '').trim();
    const sourceLabel = String(getArgValue(args, 'source', 'opencode') || '').trim();
    const severity = String(getArgValue(args, 'severity', 'info') || 'info').trim();

    if (!message) {
        throw new Error('Missing required --message');
    }

    const id = await logStatusUpdate({ message, sourceLabel, severity });
    console.log(JSON.stringify({ status: 'logged', id }, null, 2));
}

main()
    .catch((error) => {
        console.error('log-status-update error:', error.message);
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
