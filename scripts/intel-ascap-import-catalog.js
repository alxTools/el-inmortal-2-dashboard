#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { run, closePool } = require('../src/config/database');
const { startMissionRun, finishMissionRun } = require('../src/utils/intelAgentRuntime');
const { logStatusUpdate } = require('../src/utils/statusUpdates');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function parsePercent(value) {
    const text = String(value || '').replace('%', '').trim();
    if (!text) return null;
    const num = Number(text);
    return Number.isFinite(num) ? num : null;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];

        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }

        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
}

async function main() {
    const args = process.argv.slice(2);
    const requestedBy = getArgValue(args, 'by', 'opencode');
    const limit = Number(getArgValue(args, 'limit', 0)) || 0;
    const fileArg = getArgValue(
        args,
        'file',
        path.join(process.cwd(), 'downloads', 'ascap', 'WorksCatalog.csv')
    );

    if (!fs.existsSync(fileArg)) {
        throw new Error(`Catalog file not found: ${fileArg}`);
    }

    await logStatusUpdate({
        message: 'Iniciando import del catalogo ASCAP (WorksCatalog.csv) a la DB.',
        sourceLabel: 'ascap_catalog_import',
        severity: 'info'
    });

    const { mission, runId } = await startMissionRun({
        missionType: 'rights_registry_mapper',
        requestedBy,
        summary: { requestedBy, file: fileArg }
    });

    const stream = fs.createReadStream(fileArg, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers = null;
    let processed = 0;
    let stored = 0;

    for await (const line of reader) {
        if (!headers) {
            headers = parseCsvLine(line);
            continue;
        }

        if (!line.trim()) continue;
        const fields = parseCsvLine(line);
        const row = {};
        headers.forEach((header, idx) => {
            row[header] = fields[idx] || '';
        });

        const workTitle = row['Work Title'] || row['Work Title '] || '';
        if (!workTitle) continue;

        const party = row['Interested Parties'] || '';
        const role = String(row['Role'] || '').trim().toUpperCase();
        const society = String(row['Society'] || 'ASCAP').trim() || 'ASCAP';
        const writerIpi = String(row['IPI Number'] || '').trim() || null;
        const workId = String(row['ASCAP Work ID'] || '').trim() || null;
        const iswc = String(row['ISWC Number'] || '').trim() || null;
        const registrationStatus = String(row['Registration Status'] || '').trim();
        const interestedStatus = String(row['Interested Party Status'] || '').trim();
        const sharePercent = parsePercent(row['Own%']) ?? parsePercent(row['Collect%']);

        let writerName = null;
        let publisherName = null;
        let publisherIdentifier = null;

        if (role.startsWith('E') || role === 'AM') {
            publisherName = party || null;
            publisherIdentifier = writerIpi;
        } else {
            writerName = party || null;
        }

        const statusLabel = [registrationStatus, interestedStatus].filter(Boolean).join(' | ') || null;

        await run(
            `INSERT INTO rights_catalog_works
             (mission_id, mission_run_id, society, work_title, work_identifier, iswc, writer_name, writer_ipi,
              publisher_name, publisher_identifier, share_percent, status_label, source_label, raw_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
            [
                mission.id,
                runId,
                society,
                workTitle,
                workId,
                iswc,
                writerName,
                writerIpi,
                publisherName,
                publisherIdentifier,
                sharePercent,
                statusLabel,
                'ascap_catalog_csv',
                JSON.stringify({ row })
            ]
        );

        processed += 1;
        stored += 1;

        if (limit && stored >= limit) {
            break;
        }
    }

    await finishMissionRun({
        missionId: mission.id,
        runId,
        status: 'success',
        summary: { requestedBy, file: fileArg, processed, stored },
        errorText: null
    });

    await logStatusUpdate({
        message: `ASCAP catalog import completado. Filas procesadas: ${processed}. Guardadas: ${stored}.`,
        sourceLabel: 'ascap_catalog_import',
        severity: 'info'
    });

    console.log(JSON.stringify({ status: 'success', processed, stored, runId }, null, 2));
}

main()
    .catch((error) => {
        console.error('intel-ascap-import-catalog error:', error.message);
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
