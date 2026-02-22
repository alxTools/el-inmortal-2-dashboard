#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { getAll, closePool } = require('../src/config/database');
const { logStatusUpdate } = require('../src/utils/statusUpdates');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function csvEscape(value) {
    const text = String(value ?? '');
    if (text.includes('"')) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    if (text.includes(',') || text.includes('\n')) {
        return `"${text}"`;
    }
    return text;
}

function buildCsv(rows, headers) {
    const lines = [];
    lines.push(headers.map(csvEscape).join(','));
    for (const row of rows) {
        const line = headers.map((key) => csvEscape(row[key] ?? '')).join(',');
        lines.push(line);
    }
    return lines.join('\n');
}

function splitList(value) {
    return String(value || '')
        .split('|')
        .map((item) => item.trim())
        .filter(Boolean);
}

async function main() {
    const args = process.argv.slice(2);
    const runId = Number(getArgValue(args, 'run-id', 0)) || 0;
    const sourceLabel = String(getArgValue(args, 'source', 'ascap_catalog_csv')).trim();
    const requestedBy = String(getArgValue(args, 'by', 'opencode')).trim() || 'opencode';

    const exportDir = path.join(process.cwd(), 'exports');
    fs.mkdirSync(exportDir, { recursive: true });

    const whereClauses = [];
    const params = [];
    if (runId) {
        whereClauses.push('mission_run_id = ?');
        params.push(runId);
    }
    if (sourceLabel) {
        whereClauses.push('source_label = ?');
        params.push(sourceLabel);
    }

    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const rows = await getAll(
        `SELECT society, work_title, work_identifier, iswc, writer_name, writer_ipi,
                publisher_name, publisher_identifier, share_percent, status_label, source_label, created_at
         FROM rights_catalog_works
         ${whereSql}
         ORDER BY work_title ASC`,
        params
    );

    const rawHeaders = [
        'society',
        'work_title',
        'work_identifier',
        'iswc',
        'writer_name',
        'writer_ipi',
        'publisher_name',
        'publisher_identifier',
        'share_percent',
        'status_label',
        'source_label',
        'created_at'
    ];

    const rawCsv = buildCsv(rows, rawHeaders);
    const rawPath = path.join(exportDir, `ascap_catalog_raw_${runId || 'all'}.csv`);
    fs.writeFileSync(rawPath, rawCsv, 'utf8');

    const summaryMap = new Map();
    for (const row of rows) {
        const key = row.work_identifier || `${row.work_title || ''}||${row.iswc || ''}`;
        if (!summaryMap.has(key)) {
            summaryMap.set(key, {
                society: row.society,
                work_title: row.work_title,
                work_identifier: row.work_identifier,
                iswc: row.iswc,
                writers: new Map(),
                publishers: new Map(),
                share_total: 0,
                status_label: row.status_label,
                source_label: row.source_label,
                record_count: 0
            });
        }

        const bucket = summaryMap.get(key);
        if (row.writer_name) {
            const writerKey = `${row.writer_name}::${row.writer_ipi || ''}`;
            if (!bucket.writers.has(writerKey)) {
                bucket.writers.set(writerKey, { name: row.writer_name, ipi: row.writer_ipi, shares: [] });
            }
            if (row.share_percent != null) {
                bucket.writers.get(writerKey).shares.push(row.share_percent);
            }
        }

        if (row.publisher_name) {
            const publisherKey = `${row.publisher_name}::${row.publisher_identifier || ''}`;
            if (!bucket.publishers.has(publisherKey)) {
                bucket.publishers.set(publisherKey, {
                    name: row.publisher_name,
                    ipi: row.publisher_identifier,
                    shares: []
                });
            }
            if (row.share_percent != null) {
                bucket.publishers.get(publisherKey).shares.push(row.share_percent);
            }
        }

        if (row.share_percent != null) {
            bucket.share_total += Number(row.share_percent) || 0;
        }

        bucket.record_count += 1;
    }

    const summaryRows = Array.from(summaryMap.values()).map((entry) => {
        const writerList = Array.from(entry.writers.values()).map((writer) => {
            const shares = writer.shares.length ? ` (${writer.shares.join('+')}%)` : '';
            const ipi = writer.ipi ? ` [${writer.ipi}]` : '';
            return `${writer.name}${ipi}${shares}`.trim();
        });

        const publisherList = Array.from(entry.publishers.values()).map((publisher) => {
            const shares = publisher.shares.length ? ` (${publisher.shares.join('+')}%)` : '';
            const ipi = publisher.ipi ? ` [${publisher.ipi}]` : '';
            return `${publisher.name}${ipi}${shares}`.trim();
        });

        return {
            society: entry.society,
            work_title: entry.work_title,
            work_identifier: entry.work_identifier,
            iswc: entry.iswc,
            writers: writerList.join('; '),
            publishers: publisherList.join('; '),
            share_total: entry.share_total ? entry.share_total.toFixed(2) : '',
            status_label: entry.status_label,
            source_label: entry.source_label,
            record_count: entry.record_count
        };
    });

    const summaryHeaders = [
        'society',
        'work_title',
        'work_identifier',
        'iswc',
        'writers',
        'publishers',
        'share_total',
        'status_label',
        'source_label',
        'record_count'
    ];

    const summaryCsv = buildCsv(summaryRows, summaryHeaders);
    const summaryPath = path.join(exportDir, `ascap_catalog_summary_${runId || 'all'}.csv`);
    fs.writeFileSync(summaryPath, summaryCsv, 'utf8');

    await logStatusUpdate({
        message: `ASCAP export listo: raw=${path.basename(rawPath)} summary=${path.basename(summaryPath)} (rows ${rows.length}).`,
        sourceLabel: 'ascap_export',
        severity: 'info'
    });

    console.log(JSON.stringify({
        status: 'success',
        rawPath,
        summaryPath,
        rows: rows.length,
        runId: runId || null,
        sourceLabel
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('export-ascap-catalog error:', error.message);
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
