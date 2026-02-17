const crypto = require('crypto');
const { run } = require('../src/config/database');
const { ensureApiKeysTable, hashApiKey } = require('../src/middleware/apiKeyAuth');

async function main() {
    const name = process.argv[2] || 'MCP Key';
    const companyIdArg = process.argv[3];
    const companyId = companyIdArg ? Number(companyIdArg) : null;

    if (companyIdArg && Number.isNaN(companyId)) {
        console.error('Invalid company_id. Usage: npm run api:key:create -- "Key Name" [company_id]');
        process.exit(1);
    }

    await ensureApiKeysTable();

    const plainKey = `mcp_${crypto.randomBytes(24).toString('hex')}`;
    const keyHash = hashApiKey(plainKey);

    const result = await run(
        `INSERT INTO api_keys (company_id, name, key_hash, status)
         VALUES (?, ?, ?, 'active')`,
        [companyId, name, keyHash]
    );

    console.log('API key created successfully');
    console.log('id:', result.lastID || result.insertId);
    console.log('name:', name);
    console.log('company_id:', companyId);
    console.log('api_key:', plainKey);
    console.log('IMPORTANT: Save this key now. It is not retrievable later.');
    process.exit(0);
}

main().catch((err) => {
    console.error('Failed to create API key:', err.message);
    process.exit(1);
});
