const { getAll, getOne, query, run } = require('../config/database');

let landingPagesSchemaReady = false;

function isSQLiteMode() {
    return process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;
}

function toBoolInt(value) {
    return value ? 1 : 0;
}

function normalizeSlug(rawValue) {
    return String(rawValue || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function normalizeOptionalText(rawValue, maxLength = 255) {
    const value = String(rawValue || '').trim();
    if (!value) return null;
    return value.slice(0, maxLength);
}

function normalizeMode(rawMode) {
    return String(rawMode || '').trim().toLowerCase() === 'redirect' ? 'redirect' : 'internal';
}

function normalizeSortOrder(rawValue, fallback = 0) {
    const parsed = Number.parseInt(String(rawValue ?? ''), 10);
    if (!Number.isInteger(parsed)) return fallback;
    return Math.max(-9999, Math.min(9999, parsed));
}

function mapLandingPage(row) {
    if (!row) return null;
    return {
        id: Number(row.id),
        slug: String(row.slug || '').trim(),
        name: String(row.name || '').trim(),
        description: String(row.description || '').trim(),
        mode: String(row.mode || 'internal').trim().toLowerCase() === 'redirect' ? 'redirect' : 'internal',
        renderKey: String(row.render_key || '').trim(),
        targetUrl: String(row.target_url || '').trim(),
        isActive: Number(row.is_active || 0) === 1,
        sortOrder: Number(row.sort_order || 0),
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
    };
}

async function ensureLandingPagesTables() {
    if (landingPagesSchemaReady) return;

    if (isSQLiteMode()) {
        await query(
            `CREATE TABLE IF NOT EXISTS landing_pages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                description TEXT,
                mode TEXT NOT NULL DEFAULT 'internal',
                render_key TEXT,
                target_url TEXT,
                is_active INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS landing_page_views (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                page_slug TEXT NOT NULL,
                visitor_key TEXT NOT NULL,
                viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(page_slug, visitor_key)
            )`
        );
    } else {
        await query(
            `CREATE TABLE IF NOT EXISTS landing_pages (
                id INT NOT NULL AUTO_INCREMENT,
                slug VARCHAR(80) NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                mode VARCHAR(20) NOT NULL DEFAULT 'internal',
                render_key VARCHAR(80) NULL,
                target_url TEXT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 0,
                sort_order INT NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uniq_slug (slug),
                KEY idx_active_sort (is_active, sort_order)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        );

        await query(
            `CREATE TABLE IF NOT EXISTS landing_page_views (
                id BIGINT NOT NULL AUTO_INCREMENT,
                page_slug VARCHAR(80) NOT NULL,
                visitor_key VARCHAR(140) NOT NULL,
                viewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (id),
                UNIQUE KEY uniq_page_visitor (page_slug, visitor_key),
                KEY idx_visitor (visitor_key),
                KEY idx_page_slug (page_slug)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
        );
    }

    await seedDefaultLandingPage();
    landingPagesSchemaReady = true;
}

async function seedDefaultLandingPage() {
    const existingEi2 = await getOne(
        `SELECT id
         FROM landing_pages
         WHERE slug = ?
         LIMIT 1`,
        ['ei2']
    );

    if (existingEi2) {
        return;
    }

    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM landing_pages');
    const nextSort = Number(maxSort?.max_sort || 0) + 10;

    await run(
        `INSERT INTO landing_pages (
            slug,
            name,
            description,
            mode,
            render_key,
            target_url,
            is_active,
            sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            'ei2',
            'EI2',
            'Landing principal en produccion (actual).',
            'internal',
            'ei2',
            null,
            1,
            nextSort
        ]
    );
}

async function listLandingPages() {
    await ensureLandingPagesTables();

    const rows = await getAll(
        `SELECT
            id,
            slug,
            name,
            description,
            mode,
            render_key,
            target_url,
            is_active,
            sort_order,
            created_at,
            updated_at
         FROM landing_pages
         ORDER BY sort_order ASC, id ASC`
    );

    return rows.map(mapLandingPage);
}

async function getLandingPageById(landingPageId) {
    await ensureLandingPagesTables();

    const row = await getOne(
        `SELECT
            id,
            slug,
            name,
            description,
            mode,
            render_key,
            target_url,
            is_active,
            sort_order,
            created_at,
            updated_at
         FROM landing_pages
         WHERE id = ?
         LIMIT 1`,
        [landingPageId]
    );

    return mapLandingPage(row);
}

async function getActiveLandingPages() {
    await ensureLandingPagesTables();

    const rows = await getAll(
        `SELECT
            id,
            slug,
            name,
            description,
            mode,
            render_key,
            target_url,
            is_active,
            sort_order,
            created_at,
            updated_at
         FROM landing_pages
         WHERE is_active = 1
         ORDER BY sort_order ASC, id ASC`
    );

    return rows.map(mapLandingPage);
}

async function createLandingPage(payload = {}) {
    await ensureLandingPagesTables();

    const slug = normalizeSlug(payload.slug);
    const name = normalizeOptionalText(payload.name, 255);
    const description = normalizeOptionalText(payload.description, 1000);
    const mode = normalizeMode(payload.mode);
    const renderKey = normalizeOptionalText(payload.renderKey, 80) || (mode === 'internal' ? 'ei2' : null);
    const targetUrl = normalizeOptionalText(payload.targetUrl, 2000);
    const isActive = toBoolInt(Boolean(payload.isActive));

    if (!slug) {
        throw new Error('landing_slug_required');
    }

    if (!name) {
        throw new Error('landing_name_required');
    }

    if (mode === 'redirect' && !targetUrl) {
        throw new Error('landing_target_url_required');
    }

    const duplicate = await getOne('SELECT id FROM landing_pages WHERE slug = ? LIMIT 1', [slug]);
    if (duplicate) {
        throw new Error('landing_slug_duplicate');
    }

    const maxSort = await getOne('SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM landing_pages');
    const nextSort = Number(maxSort?.max_sort || 0) + 10;
    const sortOrder = normalizeSortOrder(payload.sortOrder, nextSort);

    const insertResult = await run(
        `INSERT INTO landing_pages (
            slug,
            name,
            description,
            mode,
            render_key,
            target_url,
            is_active,
            sort_order
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [slug, name, description, mode, renderKey, targetUrl, isActive, sortOrder]
    );

    return getLandingPageById(insertResult.lastID);
}

async function setLandingPageActive(landingPageId, isActive) {
    await ensureLandingPagesTables();

    await run(
        `UPDATE landing_pages
         SET is_active = ?
         WHERE id = ?`,
        [toBoolInt(Boolean(isActive)), landingPageId]
    );

    return getLandingPageById(landingPageId);
}

async function setLandingPageSortOrder(landingPageId, sortOrder) {
    await ensureLandingPagesTables();

    await run(
        `UPDATE landing_pages
         SET sort_order = ?
         WHERE id = ?`,
        [normalizeSortOrder(sortOrder, 0), landingPageId]
    );

    return getLandingPageById(landingPageId);
}

async function getSeenLandingSlugs(visitorKey, allowedSlugs = []) {
    await ensureLandingPagesTables();

    const normalizedVisitorKey = String(visitorKey || '').trim();
    if (!normalizedVisitorKey) {
        return [];
    }

    const slugList = Array.isArray(allowedSlugs)
        ? allowedSlugs.map((value) => normalizeSlug(value)).filter(Boolean)
        : [];

    if (!slugList.length) {
        const rows = await getAll(
            `SELECT page_slug
             FROM landing_page_views
             WHERE visitor_key = ?`,
            [normalizedVisitorKey]
        );

        return rows.map((row) => String(row.page_slug || '').trim()).filter(Boolean);
    }

    const placeholders = slugList.map(() => '?').join(', ');
    const rows = await getAll(
        `SELECT page_slug
         FROM landing_page_views
         WHERE visitor_key = ?
           AND page_slug IN (${placeholders})`,
        [normalizedVisitorKey, ...slugList]
    );

    return rows.map((row) => String(row.page_slug || '').trim()).filter(Boolean);
}

async function markLandingAsSeen(visitorKey, pageSlug) {
    await ensureLandingPagesTables();

    const normalizedVisitorKey = String(visitorKey || '').trim();
    const normalizedSlug = normalizeSlug(pageSlug);

    if (!normalizedVisitorKey || !normalizedSlug) {
        return;
    }

    if (isSQLiteMode()) {
        await query(
            `INSERT OR IGNORE INTO landing_page_views (page_slug, visitor_key, viewed_at)
             VALUES (?, ?, CURRENT_TIMESTAMP)`,
            [normalizedSlug, normalizedVisitorKey]
        );
        await query(
            `UPDATE landing_page_views
             SET viewed_at = CURRENT_TIMESTAMP
             WHERE page_slug = ? AND visitor_key = ?`,
            [normalizedSlug, normalizedVisitorKey]
        );
        return;
    }

    await query(
        `INSERT INTO landing_page_views (page_slug, visitor_key, viewed_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON DUPLICATE KEY UPDATE viewed_at = VALUES(viewed_at)`,
        [normalizedSlug, normalizedVisitorKey]
    );
}

module.exports = {
    ensureLandingPagesTables,
    listLandingPages,
    getLandingPageById,
    getActiveLandingPages,
    createLandingPage,
    setLandingPageActive,
    setLandingPageSortOrder,
    getSeenLandingSlugs,
    markLandingAsSeen,
    normalizeSlug
};
