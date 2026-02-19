#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const { query, run, closePool } = require('../src/config/database');

function getRequiredEnv(name) {
    const value = process.env[name];
    if (value === undefined || value === null || String(value).trim() === '') {
        throw new Error(`Missing env var: ${name}`);
    }
    return String(value).trim();
}

function getTimestampForFile() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mi = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`;
}

function parseIntSafe(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveBackupDir() {
    const configured = String(process.env.DB_BACKUP_DIR || '').trim();
    if (configured) return configured;
    return path.join(process.cwd(), 'backups', 'db_artistaviral');
}

function resolveMysqldumpExecutable() {
    const explicit = String(process.env.MYSQLDUMP_PATH || '').trim();
    if (explicit) {
        if (!fs.existsSync(explicit)) {
            throw new Error(`MYSQLDUMP_PATH not found: ${explicit}`);
        }
        return explicit;
    }

    const candidates = process.platform === 'win32'
        ? [
            'C:\\Program Files\\MySQL\\MySQL Workbench 8.0 CE\\mysqldump.exe',
            'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe',
            'C:\\Program Files\\MariaDB 11.4\\bin\\mysqldump.exe',
            'mysqldump.exe',
            'mysqldump'
        ]
        : ['mysqldump'];

    for (const candidate of candidates) {
        if (candidate.includes(path.sep)) {
            if (fs.existsSync(candidate)) return candidate;
        } else {
            return candidate;
        }
    }

    throw new Error('mysqldump executable not found');
}

async function ensureBackupRunsTable() {
    await query(`
        CREATE TABLE IF NOT EXISTS database_backup_runs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            backup_target VARCHAR(128) NOT NULL,
            status VARCHAR(32) NOT NULL,
            backup_file_path VARCHAR(1000) NULL,
            backup_file_size_bytes BIGINT NULL,
            backup_tool VARCHAR(255) NULL,
            message_text TEXT NULL,
            requested_by_user VARCHAR(128) NULL,
            started_at DATETIME NOT NULL,
            finished_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_target_status (backup_target, status),
            KEY idx_started_at (started_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function logBackupRun({
    backupTarget,
    status,
    backupFilePath,
    backupFileSizeBytes,
    backupTool,
    messageText,
    requestedBy,
    startedAt,
    finishedAt
}) {
    await ensureBackupRunsTable();
    await run(
        `INSERT INTO database_backup_runs
         (backup_target, status, backup_file_path, backup_file_size_bytes, backup_tool, message_text,
          requested_by_user, started_at, finished_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            backupTarget,
            status,
            backupFilePath || null,
            backupFileSizeBytes || null,
            backupTool || null,
            messageText || null,
            requestedBy || 'system',
            startedAt,
            finishedAt || null
        ]
    );
}

async function cleanupOldBackups(backupDir, retentionDays) {
    const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const entries = fs.readdirSync(backupDir, { withFileTypes: true });
    let deleted = 0;
    for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!entry.name.endsWith('.sql.gz')) continue;

        const fullPath = path.join(backupDir, entry.name);
        const stat = fs.statSync(fullPath);
        if ((now - stat.mtimeMs) > retentionMs) {
            fs.unlinkSync(fullPath);
            deleted += 1;
        }
    }

    return deleted;
}

function backupDatabase({
    backupDir,
    backupFilePath,
    executable,
    host,
    port,
    user,
    password,
    database
}) {
    return new Promise((resolve, reject) => {
        const args = [
            `--host=${host}`,
            `--port=${port}`,
            `--user=${user}`,
            '--single-transaction',
            '--routines',
            '--triggers',
            '--events',
            '--set-gtid-purged=OFF',
            '--default-character-set=utf8mb4',
            database
        ];

        const dump = spawn(executable, args, {
            env: {
                ...process.env,
                MYSQL_PWD: password
            },
            cwd: backupDir,
            windowsHide: true
        });

        const gzip = zlib.createGzip({ level: zlib.constants.Z_BEST_SPEED });
        const output = fs.createWriteStream(backupFilePath);
        let stderr = '';

        dump.stderr.on('data', (chunk) => {
            stderr += String(chunk || '');
        });

        dump.stdout.pipe(gzip).pipe(output);

        output.on('error', (error) => reject(error));
        gzip.on('error', (error) => reject(error));

        dump.on('error', (error) => reject(error));
        dump.on('close', (code) => {
            if (code !== 0) {
                return reject(new Error(`mysqldump_failed:${code}:${stderr.slice(0, 500)}`));
            }
            return resolve();
        });
    });
}

async function main() {
    const startedAt = new Date();
    const requestedBy = String(process.env.DB_BACKUP_REQUESTED_BY || 'scheduler').trim();
    const backupTarget = 'db.artistaviral.com';

    const host = getRequiredEnv('DB_HOST');
    const port = parseIntSafe(process.env.DB_PORT, 3306);
    const user = getRequiredEnv('DB_USER');
    const password = getRequiredEnv('DB_PASSWORD');
    const database = getRequiredEnv('DB_NAME');

    const backupDir = resolveBackupDir();
    const retentionDays = parseIntSafe(process.env.DB_BACKUP_RETENTION_DAYS, 14);
    const executable = resolveMysqldumpExecutable();
    const timestamp = getTimestampForFile();
    const backupFileName = `${database}-${timestamp}.sql.gz`;
    const backupFilePath = path.join(backupDir, backupFileName);

    if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
    }

    try {
        await backupDatabase({
            backupDir,
            backupFilePath,
            executable,
            host,
            port,
            user,
            password,
            database
        });

        const stat = fs.statSync(backupFilePath);
        const deletedCount = await cleanupOldBackups(backupDir, retentionDays);
        const finishedAt = new Date();

        await logBackupRun({
            backupTarget,
            status: 'success',
            backupFilePath,
            backupFileSizeBytes: stat.size,
            backupTool: executable,
            messageText: `ok; old_backups_deleted=${deletedCount}`,
            requestedBy,
            startedAt,
            finishedAt
        });

        console.log(JSON.stringify({
            status: 'success',
            backupTarget,
            backupFilePath,
            backupFileSizeBytes: stat.size,
            deletedOldBackups: deletedCount,
            retentionDays,
            startedAt: startedAt.toISOString(),
            finishedAt: finishedAt.toISOString()
        }, null, 2));
    } catch (error) {
        const finishedAt = new Date();
        const message = String(error.message || 'backup_failed').slice(0, 1000);

        try {
            await logBackupRun({
                backupTarget,
                status: 'error',
                backupFilePath,
                backupFileSizeBytes: null,
                backupTool: executable,
                messageText: message,
                requestedBy,
                startedAt,
                finishedAt
            });
        } catch (_) {
            // no-op
        }

        throw error;
    }
}

main()
    .catch((error) => {
        console.error('backup-artistaviral-db error:', error.message);
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
