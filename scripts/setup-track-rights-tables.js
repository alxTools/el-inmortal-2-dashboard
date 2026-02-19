#!/usr/bin/env node

require('dotenv').config();

const { query, closePool } = require('../src/config/database');

async function main() {
    await query(`
        CREATE TABLE IF NOT EXISTS track_split_participants (
            id BIGINT NOT NULL AUTO_INCREMENT,
            track_id INT NOT NULL,
            album_id INT NULL,
            track_number INT NULL,
            participant_name VARCHAR(255) NOT NULL,
            legal_name VARCHAR(255) NULL,
            email VARCHAR(255) NULL,
            country_code VARCHAR(16) NULL,
            role_type VARCHAR(64) NOT NULL,
            pro_society VARCHAR(64) NULL,
            pro_identifier VARCHAR(128) NULL,
            publisher_name VARCHAR(255) NULL,
            publisher_identifier VARCHAR(128) NULL,
            share_percent DECIMAL(5,2) NOT NULL,
            split_scope VARCHAR(32) NOT NULL DEFAULT 'copyright',
            is_primary_artist TINYINT(1) NOT NULL DEFAULT 0,
            notes TEXT NULL,
            source_label VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_track_participant_role_scope (track_id, participant_name, role_type, split_scope),
            KEY idx_track (track_id),
            KEY idx_name (participant_name),
            CONSTRAINT fk_track_split_participants_track FOREIGN KEY (track_id)
                REFERENCES tracks(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS track_rights_terms (
            id BIGINT NOT NULL AUTO_INCREMENT,
            track_id INT NOT NULL,
            master_owner VARCHAR(255) NOT NULL,
            reuse_after_months INT NOT NULL DEFAULT 12,
            requires_new_isrc TINYINT(1) NOT NULL DEFAULT 1,
            requires_same_splits TINYINT(1) NOT NULL DEFAULT 1,
            notes TEXT NULL,
            source_label VARCHAR(120) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_track_rights_terms_track (track_id),
            KEY idx_track (track_id),
            CONSTRAINT fk_track_rights_terms_track FOREIGN KEY (track_id)
                REFERENCES tracks(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('track rights tables ready');
}

main()
    .catch((error) => {
        console.error('setup-track-rights-tables error:', error.message);
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
