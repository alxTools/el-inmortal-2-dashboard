const { getAll, run } = require('../config/database');

async function ensureStatusUpdatesTable() {
    await run(`
        CREATE TABLE IF NOT EXISTS system_status_updates (
            id BIGINT NOT NULL AUTO_INCREMENT,
            message TEXT NOT NULL,
            source_label VARCHAR(120) NULL,
            severity VARCHAR(32) NOT NULL DEFAULT 'info',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_created_at (created_at),
            KEY idx_severity (severity)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
}

async function logStatusUpdate({ message, sourceLabel = null, severity = 'info' }) {
    const trimmed = String(message || '').trim();
    if (!trimmed) {
        throw new Error('message is required');
    }

    await ensureStatusUpdatesTable();

    const insert = await run(
        `INSERT INTO system_status_updates (message, source_label, severity)
         VALUES (?, ?, ?)`,
        [trimmed, sourceLabel, severity]
    );

    return insert.insertId || insert.lastID;
}

async function getLatestUpdates({ limit = 5, afterId = 0 }) {
    await ensureStatusUpdatesTable();

    const safeLimit = Math.max(1, Math.min(20, Number(limit || 5) || 5));
    const safeAfter = Math.max(0, Number(afterId || 0) || 0);

    return getAll(
        `SELECT id, message, source_label, severity, created_at
         FROM system_status_updates
         WHERE id > ?
         ORDER BY id DESC
         LIMIT ?`,
        [safeAfter, safeLimit]
    );
}

module.exports = {
    ensureStatusUpdatesTable,
    logStatusUpdate,
    getLatestUpdates
};
