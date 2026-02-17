const crypto = require('crypto');
const { getOne, run } = require('../config/database');

let apiKeysTableReady = false;

function hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
}

async function ensureApiKeysTable() {
    if (apiKeysTableReady) return;

    await run(`
        CREATE TABLE IF NOT EXISTS api_keys (
            id INT AUTO_INCREMENT PRIMARY KEY,
            company_id INT NULL,
            name VARCHAR(120) NOT NULL,
            key_hash CHAR(64) NOT NULL UNIQUE,
            status VARCHAR(20) DEFAULT 'active',
            scopes TEXT NULL,
            last_used_at DATETIME NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    apiKeysTableReady = true;
}

function extractApiKey(req) {
    const fromHeader = req.headers['x-api-key'];
    if (fromHeader) return fromHeader;

    const auth = req.headers.authorization || '';
    if (auth.startsWith('Bearer ')) return auth.slice('Bearer '.length);

    return null;
}

async function apiKeyAuth(req, res, next) {
    try {
        const apiKey = extractApiKey(req);
        if (!apiKey) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'API_KEY_REQUIRED',
                    message: 'Missing API key. Use x-api-key or Authorization: Bearer <key>'
                }
            });
        }

        const masterKey = process.env.MCP_MASTER_API_KEY;
        if (masterKey && apiKey === masterKey) {
            req.apiClient = {
                isMaster: true,
                id: 'master',
                name: 'Master API Key',
                companyId: null,
                scopes: ['*']
            };
            return next();
        }

        await ensureApiKeysTable();

        const keyHash = hashApiKey(apiKey);
        const keyRecord = await getOne(
            `SELECT ak.*, c.name AS company_name
             FROM api_keys ak
             LEFT JOIN companies c ON c.id = ak.company_id
             WHERE ak.key_hash = ? AND ak.status = 'active'
             LIMIT 1`,
            [keyHash]
        );

        if (!keyRecord) {
            return res.status(401).json({
                success: false,
                error: {
                    code: 'INVALID_API_KEY',
                    message: 'Invalid or inactive API key'
                }
            });
        }

        await run('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [keyRecord.id]);

        req.apiClient = {
            isMaster: false,
            id: keyRecord.id,
            name: keyRecord.name,
            companyId: keyRecord.company_id || null,
            companyName: keyRecord.company_name || null,
            scopes: keyRecord.scopes ? keyRecord.scopes.split(',').map((s) => s.trim()) : []
        };

        return next();
    } catch (error) {
        console.error('API key auth error:', error);
        return res.status(500).json({
            success: false,
            error: {
                code: 'AUTH_INTERNAL_ERROR',
                message: 'Failed to validate API key'
            }
        });
    }
}

module.exports = {
    apiKeyAuth,
    hashApiKey,
    ensureApiKeysTable
};
