const { getAll, getOne, query, run } = require('../config/database');

/**
 * Verifica y crea la tabla central de leads si no existe
 * También detecta las tablas de WordPress existentes
 */
async function ensureLandingLeadsTable() {
    try {
        // Verificar si estamos usando MySQL o SQLite
        const isSQLite = process.env.DB_TYPE === 'sqlite' || !process.env.DB_HOST;
        
        if (isSQLite) {
            // SQLite syntax
            await query(
                `CREATE TABLE IF NOT EXISTS landing_email_leads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    email TEXT NOT NULL,
                    full_name TEXT,
                    country TEXT,
                    source_label TEXT NOT NULL DEFAULT 'landing_el_inmortal_2',
                    source_site TEXT DEFAULT 'el_inmortal_2',
                    ip_address TEXT,
                    user_agent TEXT,
                    synced_to_wordpress INTEGER DEFAULT 0,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )`
            );
            
            // Verificar columnas
            const tableInfo = await getAll(`PRAGMA table_info(landing_email_leads)`);
            const columnSet = new Set(tableInfo.map((row) => row.name));
            
            if (!columnSet.has('full_name')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN full_name TEXT');
            }
            if (!columnSet.has('country')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN country TEXT');
            }
            if (!columnSet.has('source_site')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN source_site TEXT DEFAULT "el_inmortal_2"');
            }
            if (!columnSet.has('synced_to_wordpress')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN synced_to_wordpress INTEGER DEFAULT 0');
            }
        } else {
            // MySQL syntax
            await query(
                `CREATE TABLE IF NOT EXISTS landing_email_leads (
                    id BIGINT NOT NULL AUTO_INCREMENT,
                    email VARCHAR(255) NOT NULL,
                    full_name VARCHAR(255) NULL,
                    country VARCHAR(120) NULL,
                    source_label VARCHAR(128) NOT NULL DEFAULT 'landing_el_inmortal_2',
                    source_site VARCHAR(100) DEFAULT 'el_inmortal_2',
                    ip_address VARCHAR(64) NULL,
                    user_agent VARCHAR(255) NULL,
                    synced_to_wordpress TINYINT DEFAULT 0,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (id),
                    KEY idx_email (email),
                    KEY idx_country (country),
                    KEY idx_source (source_label),
                    KEY idx_site (source_site)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
            );

            const columns = await getAll(
                `SELECT column_name FROM information_schema.columns
                 WHERE table_schema = DATABASE() AND table_name = 'landing_email_leads'`
            );
            const columnSet = new Set(columns.map((row) => row.column_name));

            if (!columnSet.has('full_name')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN full_name VARCHAR(255) NULL');
            }
            if (!columnSet.has('country')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN country VARCHAR(120) NULL');
            }
            if (!columnSet.has('source_site')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN source_site VARCHAR(100) DEFAULT "el_inmortal_2"');
            }
            if (!columnSet.has('synced_to_wordpress')) {
                await query('ALTER TABLE landing_email_leads ADD COLUMN synced_to_wordpress TINYINT DEFAULT 0');
            }
        }
        
        console.log('[Landing] ✅ Tabla landing_email_leads verificada/creada exitosamente');
    } catch (error) {
        console.error('[Landing] ❌ Error creando tabla:', error);
        throw error;
    }
}

/**
 * Intenta sincronizar el email con las tablas de WordPress existentes
 * @param {Object} leadData - Datos del lead
 */
async function syncToWordPress(leadData) {
    const { email, full_name, country, source_label } = leadData;
    const results = [];
    
    // Lista de sitios WordPress a sincronizar
    const wpSites = [
        { db: 'gtalx_wordpress', table: 'wp_csmm_users', site: 'galantealx.com' },
        { db: 'atm_wordpress', table: 'wp_csmm_users', site: 'alxthemaster.com' },
        { db: 'gt_wordpress', table: 'wp_csmm_users', site: 'galanteelemperador.com' }
    ];
    
    for (const site of wpSites) {
        try {
            // Verificar si la tabla existe
            const tableExists = await getOne(
                `SELECT 1 FROM information_schema.tables 
                 WHERE table_schema = ? AND table_name = ?`,
                [site.db, site.table]
            );
            
            if (!tableExists) {
                console.log(`[Landing] ⚠️ Tabla ${site.db}.${site.table} no existe, saltando...`);
                continue;
            }
            
            // Verificar si el email ya existe
            const existing = await getOne(
                `SELECT id FROM \`${site.db}\`.\`${site.table}\` WHERE email = ?`,
                [email]
            );
            
            if (existing) {
                console.log(`[Landing] ℹ️ Email ya existe en ${site.site}`);
                results.push({ site: site.site, status: 'already_exists' });
                continue;
            }
            
            // Insertar en WordPress
            await query(
                `INSERT INTO \`${site.db}\`.\`${site.table}\` (email, registered, deleted) 
                 VALUES (?, NOW(), 0)`,
                [email]
            );
            
            console.log(`[Landing] ✅ Email sincronizado a ${site.site}`);
            results.push({ site: site.site, status: 'synced' });
            
        } catch (error) {
            console.error(`[Landing] ❌ Error sincronizando a ${site.site}:`, error.message);
            results.push({ site: site.site, status: 'error', error: error.message });
        }
    }
    
    return results;
}

/**
 * Obtiene estadísticas unificadas de todos los sitios
 */
async function getUnifiedStats() {
    try {
        // Contar en tabla local
        const localCount = await getOne('SELECT COUNT(*) as total FROM landing_email_leads');
        
        // Contar en tablas WordPress
        const wpSites = [
            { db: 'gtalx_wordpress', table: 'wp_csmm_users', name: 'galantealx.com' },
            { db: 'atm_wordpress', table: 'wp_csmm_users', name: 'alxthemaster.com' },
            { db: 'gt_wordpress', table: 'wp_csmm_users', name: 'galanteelemperador.com' }
        ];
        
        const wpStats = [];
        for (const site of wpSites) {
            try {
                const count = await getOne(
                    `SELECT COUNT(*) as total FROM \`${site.db}\`.\`${site.table}\` WHERE deleted = 0`
                );
                wpStats.push({
                    site: site.name,
                    total: count?.total || 0
                });
            } catch (e) {
                wpStats.push({
                    site: site.name,
                    total: 0,
                    error: 'No access'
                });
            }
        }
        
        // Top países
        const topCountries = await getAll(
            `SELECT country, COUNT(*) AS total
             FROM landing_email_leads
             WHERE country IS NOT NULL AND country <> ''
             GROUP BY country
             ORDER BY total DESC
             LIMIT 10`
        );
        
        return {
            local: localCount?.total || 0,
            wordpress: wpStats,
            total: (localCount?.total || 0) + wpStats.reduce((sum, s) => sum + (s.total || 0), 0),
            topCountries: topCountries || []
        };
    } catch (error) {
        console.error('[Landing] Error obteniendo estadísticas unificadas:', error);
        return { local: 0, wordpress: [], total: 0, topCountries: [] };
    }
}

module.exports = {
    ensureLandingLeadsTable,
    syncToWordPress,
    getUnifiedStats
};
