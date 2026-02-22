const crypto = require('crypto');
const { getOne } = require('../config/database');

function getEncryptionKey() {
    const source = String(
        process.env.INTEL_CRED_ENC_KEY ||
        process.env.SESSION_SECRET ||
        process.env.DB_PASSWORD ||
        ''
    ).trim();

    if (!source) {
        throw new Error('Missing INTEL_CRED_ENC_KEY/SESSION_SECRET for credential decrypt');
    }

    return crypto.createHash('sha256').update(source).digest();
}

function decryptSecret({ ciphertextB64, ivB64, tagB64 }) {
    const key = getEncryptionKey();
    const iv = Buffer.from(String(ivB64 || ''), 'base64');
    const tag = Buffer.from(String(tagB64 || ''), 'base64');
    const ciphertext = Buffer.from(String(ciphertextB64 || ''), 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plain.toString('utf8');
}

async function getIntelCredential(providerKey, username = '') {
    const provider = String(providerKey || '').trim().toLowerCase();
    if (!provider) {
        throw new Error('providerKey is required');
    }

    let row;
    if (String(username || '').trim()) {
        row = await getOne(
            `SELECT provider_key, username, secret_ciphertext, secret_iv, secret_tag, status
             FROM intel_agent_credentials
             WHERE provider_key = ? AND username = ? AND status = 'active'
             ORDER BY id DESC
             LIMIT 1`,
            [provider, String(username).trim()]
        );
    } else {
        row = await getOne(
            `SELECT provider_key, username, secret_ciphertext, secret_iv, secret_tag, status
             FROM intel_agent_credentials
             WHERE provider_key = ? AND status = 'active'
             ORDER BY id DESC
             LIMIT 1`,
            [provider]
        );
    }

    if (!row) {
        throw new Error(`No active credential found for provider: ${provider}`);
    }

    const password = decryptSecret({
        ciphertextB64: row.secret_ciphertext,
        ivB64: row.secret_iv,
        tagB64: row.secret_tag
    });

    return {
        providerKey: row.provider_key,
        username: row.username,
        password
    };
}

module.exports = {
    getIntelCredential
};
