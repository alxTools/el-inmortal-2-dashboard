const fs = require('fs');
const path = require('path');
const { getAll } = require('../src/config/database');

const PROD_BASE_URL = 'https://dash.galanteelemperador.com';
const LOCAL_PUBLIC_DIR = path.join(__dirname, '../public');

function normalizeImagePath(value) {
    if (!value || typeof value !== 'string') return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (trimmed.startsWith('/uploads/images/')) return trimmed;
    if (trimmed.startsWith('https://dash.galanteelemperador.com/uploads/images/')) {
        return trimmed.replace('https://dash.galanteelemperador.com', '');
    }

    return null;
}

async function collectImagePaths() {
    const queries = [
        "SELECT cover_image_path AS image_path FROM album_info WHERE cover_image_path IS NOT NULL AND cover_image_path != ''",
        "SELECT cover_image_path AS image_path FROM tracks WHERE cover_image_path IS NOT NULL AND cover_image_path != ''",
        "SELECT avatar_path AS image_path FROM producers WHERE avatar_path IS NOT NULL AND avatar_path != ''",
        "SELECT avatar_path AS image_path FROM composers WHERE avatar_path IS NOT NULL AND avatar_path != ''",
        "SELECT avatar_path AS image_path FROM artists WHERE avatar_path IS NOT NULL AND avatar_path != ''"
    ];

    const allRows = [];
    for (const sql of queries) {
        const rows = await getAll(sql);
        allRows.push(...rows);
    }

    const uniquePaths = new Set();
    for (const row of allRows) {
        const normalized = normalizeImagePath(row.image_path);
        if (normalized) uniquePaths.add(normalized);
    }

    return [...uniquePaths];
}

async function downloadToLocal(relativePath) {
    const targetPath = path.join(LOCAL_PUBLIC_DIR, relativePath.replace(/^\//, ''));
    const targetDir = path.dirname(targetPath);

    if (fs.existsSync(targetPath)) {
        return { status: 'exists', file: relativePath };
    }

    fs.mkdirSync(targetDir, { recursive: true });

    const url = `${PROD_BASE_URL}${relativePath}`;
    const response = await fetch(url);
    if (!response.ok) {
        return { status: 'failed', file: relativePath, code: response.status };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(targetPath, bytes);
    return { status: 'downloaded', file: relativePath, bytes: bytes.length };
}

async function main() {
    console.log('Collecting image paths from database...');
    const imagePaths = await collectImagePaths();
    console.log(`Found ${imagePaths.length} image path(s).`);

    let downloaded = 0;
    let exists = 0;
    let failed = 0;

    for (const imgPath of imagePaths) {
        try {
            const result = await downloadToLocal(imgPath);
            if (result.status === 'downloaded') {
                downloaded += 1;
                console.log(`Downloaded: ${result.file}`);
            } else if (result.status === 'exists') {
                exists += 1;
            } else {
                failed += 1;
                console.log(`Failed (${result.code}): ${result.file}`);
            }
        } catch (error) {
            failed += 1;
            console.log(`Failed (error): ${imgPath} -> ${error.message}`);
        }
    }

    console.log('---');
    console.log(`Downloaded: ${downloaded}`);
    console.log(`Already local: ${exists}`);
    console.log(`Failed: ${failed}`);

    process.exit(0);
}

main().catch((err) => {
    console.error('Sync failed:', err.message);
    process.exit(1);
});
