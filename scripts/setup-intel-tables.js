#!/usr/bin/env node

require('dotenv').config();

const { query, closePool } = require('../src/config/database');

async function main() {
    await query(`
        CREATE TABLE IF NOT EXISTS track_split_intake_queue (
            id BIGINT NOT NULL AUTO_INCREMENT,
            album_id INT NULL,
            track_id INT NULL,
            track_number INT NULL,
            track_title VARCHAR(255) NULL,
            participant_name VARCHAR(255) NOT NULL,
            legal_name VARCHAR(255) NULL,
            email VARCHAR(255) NULL,
            country_code VARCHAR(16) NULL,
            role_type VARCHAR(64) NULL,
            pro_society VARCHAR(64) NULL,
            pro_identifier VARCHAR(128) NULL,
            publisher_name VARCHAR(255) NULL,
            publisher_identifier VARCHAR(128) NULL,
            notes TEXT NULL,
            intake_status VARCHAR(32) NOT NULL DEFAULT 'unassigned',
            created_by_user VARCHAR(128) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_status (intake_status),
            KEY idx_track (track_id),
            KEY idx_name (participant_name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS intel_agent_missions (
            id BIGINT NOT NULL AUTO_INCREMENT,
            mission_type VARCHAR(80) NOT NULL,
            mission_name VARCHAR(255) NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'pending',
            priority VARCHAR(16) NOT NULL DEFAULT 'high',
            target_scope VARCHAR(255) NULL,
            config_json JSON NULL,
            requested_by_user VARCHAR(128) NULL,
            last_error TEXT NULL,
            next_run_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_mission_type (mission_type),
            KEY idx_status_priority (status, priority),
            KEY idx_next_run (next_run_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS intel_agent_runs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            mission_id BIGINT NOT NULL,
            run_status VARCHAR(32) NOT NULL,
            summary_json JSON NULL,
            error_text TEXT NULL,
            started_at DATETIME NOT NULL,
            finished_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_mission (mission_id),
            KEY idx_status_started (run_status, started_at),
            CONSTRAINT fk_intel_agent_runs_mission FOREIGN KEY (mission_id)
                REFERENCES intel_agent_missions(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS intel_evidence_items (
            id BIGINT NOT NULL AUTO_INCREMENT,
            mission_id BIGINT NULL,
            mission_run_id BIGINT NULL,
            platform VARCHAR(64) NOT NULL,
            evidence_type VARCHAR(64) NOT NULL,
            track_id INT NULL,
            track_title VARCHAR(255) NULL,
            artist_name VARCHAR(255) NULL,
            external_id VARCHAR(128) NULL,
            source_url VARCHAR(1000) NOT NULL,
            author_handle VARCHAR(255) NULL,
            posted_at DATETIME NULL,
            metadata_json JSON NULL,
            media_local_path VARCHAR(1000) NULL,
            ingest_status VARCHAR(32) NOT NULL DEFAULT 'collected',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_platform_track (platform, track_id),
            KEY idx_mission (mission_id),
            KEY idx_external (external_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS rights_catalog_works (
            id BIGINT NOT NULL AUTO_INCREMENT,
            mission_id BIGINT NULL,
            mission_run_id BIGINT NULL,
            society VARCHAR(32) NOT NULL,
            work_title VARCHAR(255) NOT NULL,
            alt_title VARCHAR(255) NULL,
            work_identifier VARCHAR(128) NULL,
            iswc VARCHAR(32) NULL,
            writer_name VARCHAR(255) NULL,
            writer_ipi VARCHAR(128) NULL,
            publisher_name VARCHAR(255) NULL,
            publisher_identifier VARCHAR(128) NULL,
            share_percent DECIMAL(5,2) NULL,
            status_label VARCHAR(64) NULL,
            source_label VARCHAR(128) NULL,
            raw_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_society_work (society, work_title),
            KEY idx_writer (writer_name),
            KEY idx_publisher (publisher_name),
            KEY idx_status (status_label)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS platform_artist_presence (
            id BIGINT NOT NULL AUTO_INCREMENT,
            platform VARCHAR(64) NOT NULL,
            artist_profile VARCHAR(255) NULL,
            track_title VARCHAR(255) NULL,
            release_title VARCHAR(255) NULL,
            isrc VARCHAR(32) NULL,
            upc VARCHAR(64) NULL,
            source_url VARCHAR(1000) NOT NULL,
            confidence_score DECIMAL(5,2) NOT NULL DEFAULT 0,
            found_by_mission_id BIGINT NULL,
            metadata_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_platform_artist (platform, artist_profile),
            KEY idx_track_title (track_title),
            KEY idx_isrc (isrc)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS ailex_keypoints (
            id BIGINT NOT NULL AUTO_INCREMENT,
            mission_id BIGINT NULL,
            keypoint_type VARCHAR(64) NOT NULL,
            title VARCHAR(255) NOT NULL,
            details TEXT NULL,
            severity VARCHAR(16) NOT NULL DEFAULT 'info',
            related_track_id INT NULL,
            related_url VARCHAR(1000) NULL,
            source_refs_json JSON NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'open',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_type_status (keypoint_type, status),
            KEY idx_severity (severity),
            KEY idx_track (related_track_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    console.log('intel tables ready');
}

main()
    .catch((error) => {
        console.error('setup-intel-tables error:', error.message);
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
