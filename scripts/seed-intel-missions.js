#!/usr/bin/env node

require('dotenv').config();

const { run, closePool } = require('../src/config/database');

const MISSIONS = [
    {
        type: 'social_signal_hunter',
        name: 'Social UGC Hunter (TikTok/IG/YT)',
        scope: 'elgenero + galante catalog',
        priority: 'high',
        config: {
            platforms: ['tiktok', 'instagram', 'youtube'],
            targets: ['dance', 'lip_sync', 'cover', 'fan_edit'],
            storeMedia: true,
            storeMetadata: true,
            schedule: 'continuous'
        }
    },
    {
        type: 'rights_registry_mapper',
        name: 'ASCAP/BMI Registry Mapper',
        scope: '~400 registered works + possible match',
        priority: 'high',
        config: {
            societies: ['ASCAP', 'BMI', 'SACM', 'SCD'],
            focus: ['possible_match', 'universal_claims'],
            requiresSecureLogin: true,
            schedule: 'daily'
        }
    },
    {
        type: 'platform_footprint_mapper',
        name: 'Catalog Footprint Mapper',
        scope: 'all platforms where Galante/ALX appears',
        priority: 'high',
        config: {
            platforms: [
                'spotify',
                'apple_music',
                'youtube_music',
                'deezer',
                'tidal',
                'lyrics_sites',
                'rights_databases'
            ],
            matchKeys: ['title', 'isrc', 'writer', 'publisher'],
            schedule: 'daily'
        }
    },
    {
        type: 'facts_keypoints_engine',
        name: 'Facts & Keypoints Engine for Ailex',
        scope: 'convert evidence into Ailex briefings',
        priority: 'high',
        config: {
            outputs: ['ailex_brief', 'fan_update', 'risk_alert'],
            tone: 'authoritative',
            schedule: 'continuous'
        }
    }
];

async function main() {
    for (const mission of MISSIONS) {
        await run(
            `INSERT INTO intel_agent_missions
             (mission_type, mission_name, status, priority, target_scope, config_json, requested_by_user, next_run_at)
             VALUES (?, ?, 'pending', ?, ?, CAST(? AS JSON), ?, NOW())
             ON DUPLICATE KEY UPDATE
               mission_name = VALUES(mission_name),
               status = 'pending',
               priority = VALUES(priority),
               target_scope = VALUES(target_scope),
               config_json = CAST(? AS JSON),
               requested_by_user = VALUES(requested_by_user),
               updated_at = CURRENT_TIMESTAMP`,
            [
                mission.type,
                mission.name,
                mission.priority,
                mission.scope,
                JSON.stringify(mission.config),
                'opencode',
                JSON.stringify(mission.config)
            ]
        );
    }

    console.log(JSON.stringify({
        status: 'seeded',
        count: MISSIONS.length
    }, null, 2));
}

main()
    .catch((error) => {
        console.error('seed-intel-missions error:', error.message);
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
