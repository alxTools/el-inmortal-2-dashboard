#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { getAll, run, closePool } = require('../src/config/database');
const { startMissionRun, finishMissionRun } = require('../src/utils/intelAgentRuntime');
const { logStatusUpdate } = require('../src/utils/statusUpdates');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function normalizeTitle(value) {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeAltTitle(value) {
    return normalizeTitle(value).replace(/\b(remix|rmx|version|edit|radio|clean|explicit)\b/g, '').replace(/\s+/g, ' ').trim();
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
    const fileArg = getArgValue(
        args,
        'file',
        'D:\\download\\WorksCatalog.csv'
    );

    if (!fs.existsSync(fileArg)) {
        throw new Error(`Catalog file not found: ${fileArg}`);
    }

    await logStatusUpdate({
        message: 'Analizando WorksCatalog.csv de ASCAP para match por track del album.',
        sourceLabel: 'ascap_catalog_analyze',
        severity: 'info'
    });

    const { mission, runId } = await startMissionRun({
        missionType: 'rights_registry_mapper',
        requestedBy,
        summary: { requestedBy, file: fileArg }
    });

    const tracks = await getAll(
        `SELECT id, track_number, title
         FROM tracks
         ORDER BY track_number ASC`
    );

    const exactMap = new Map();
    const altMap = new Map();
    for (const track of tracks) {
        const normalized = normalizeTitle(track.title);
        if (normalized) exactMap.set(normalized, track);
        const alt = normalizeAltTitle(track.title);
        if (alt && !altMap.has(alt)) altMap.set(alt, track);
    }

    const stream = fs.createReadStream(fileArg, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

    let headers = null;
    let processed = 0;
    let matched = 0;
    const trackCounts = new Map();

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

        const normalizedWork = normalizeTitle(workTitle);
        const normalizedAlt = normalizeAltTitle(workTitle);
        const track = exactMap.get(normalizedWork) || altMap.get(normalizedAlt);
        if (!track) {
            processed += 1;
            continue;
        }

        const matchType = exactMap.get(normalizedWork) ? 'exact' : 'alt';
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
                'ascap_catalog_match',
                JSON.stringify({
                    trackId: track.id,
                    trackNumber: track.track_number,
                    trackTitle: track.title,
                    matchType,
                    row
                })
            ]
        );

        matched += 1;
        trackCounts.set(track.id, (trackCounts.get(track.id) || 0) + 1);
        processed += 1;
    }

    const summary = {
        requestedBy,
        file: fileArg,
        processed,
        matched,
        tracksMatched: trackCounts.size
    };

    await finishMissionRun({
        missionId: mission.id,
        runId,
        status: 'success',
        summary,
        errorText: null
    });

    await logStatusUpdate({
        message: `ASCAP catalog analizado: ${matched} filas matched en ${trackCounts.size} tracks (runId ${runId}).`,
        sourceLabel: 'ascap_catalog_analyze',
        severity: 'info'
    });

    console.log(JSON.stringify({ status: 'success', runId, ...summary }, null, 2));
}

main()
    .catch((error) => {
        console.error('intel-ascap-analyze-catalog error:', error.message);
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
