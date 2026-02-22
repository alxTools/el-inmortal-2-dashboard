#!/usr/bin/env node

require('dotenv').config();

const crypto = require('crypto');
const { run, closePool } = require('../src/config/database');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function getRequiredArg(args, name) {
    const value = String(getArgValue(args, name, '') || '').trim();
    if (!value) {
        throw new Error(`Missing required argument --${name}`);
    }
    return value;
}

function getEncryptionKey() {
    const source = String(
        process.env.INTEL_CRED_ENC_KEY ||
        process.env.SESSION_SECRET ||
        process.env.DB_PASSWORD ||
        ''
    ).trim();

    if (!source) {
        throw new Error('Missing encryption seed. Set INTEL_CRED_ENC_KEY or SESSION_SECRET.');
    }

    return crypto.createHash('sha256').update(source).digest();
}

function encryptSecret(secret, key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        ciphertext: ciphertext.toString('base64'),
        iv: iv.toString('base64'),
        tag: tag.toString('base64')
    };
}

async function main() {
    const args = process.argv.slice(2);
    const provider = getRequiredArg(args, 'provider').toLowerCase();
    const username = getRequiredArg(args, 'username');
    const password = getRequiredArg(args, 'password');
    const notes = String(getArgValue(args, 'notes', '') || '').trim();

    const key = getEncryptionKey();
    const encrypted = encryptSecret(password, key);

    await run(
        `INSERT INTO intel_agent_credentials
         (provider_key, username, secret_ciphertext, secret_iv, secret_tag, secret_version, notes, status)
         VALUES (?, ?, ?, ?, ?, 1, ?, 'active')
         ON DUPLICATE KEY UPDATE
           secret_ciphertext = VALUES(secret_ciphertext),
           secret_iv = VALUES(secret_iv),
           secret_tag = VALUES(secret_tag),
           secret_version = VALUES(secret_version),
           notes = VALUES(notes),
           status = 'active',
           updated_at = CURRENT_TIMESTAMP`,
        [
            provider,
            username,
            encrypted.ciphertext,
            encrypted.iv,
            encrypted.tag,
            notes || null
        ]
    );

    console.log(JSON.stringify({
        status: 'saved',
        provider,
        username,
        secretVersion: 1,
        notes: notes || null
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('set-intel-credential error:', error.message);
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
