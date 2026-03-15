const { getAll, run } = require('../config/database');

let trackProjectZipSchemaReady = false;

const TRACK_PROJECT_ZIP_COLUMNS = [
    ['project_zip_drive_file_id', 'VARCHAR(255) NULL'],
    ['project_zip_drive_download_url', 'TEXT NULL'],
    ['project_zip_drive_view_url', 'TEXT NULL'],
    ['project_zip_original_name', 'VARCHAR(500) NULL'],
    ['project_zip_file_size', 'BIGINT NULL'],
    ['project_zip_uploaded_at', 'DATETIME NULL']
];

async function ensureTrackProjectZipColumns() {
    if (trackProjectZipSchemaReady) return;

    const columnRows = await getAll(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = DATABASE()
           AND table_name = 'tracks'`
    );

    const existingColumns = new Set(
        columnRows
            .map((row) => (row.column_name || row.COLUMN_NAME || '').toLowerCase())
            .filter(Boolean)
    );

    for (const [columnName, definition] of TRACK_PROJECT_ZIP_COLUMNS) {
        if (existingColumns.has(columnName.toLowerCase())) continue;
        try {
            await run(`ALTER TABLE tracks ADD COLUMN ${columnName} ${definition}`);
        } catch (error) {
            if (error.code !== 'ER_DUP_FIELDNAME') {
                throw error;
            }
        }
    }

    trackProjectZipSchemaReady = true;
}

module.exports = {
    ensureTrackProjectZipColumns
};
