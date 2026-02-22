#!/usr/bin/env node

require('dotenv').config();

const { run, closePool } = require('../src/config/database');

const SKILLS = [
    {
        key: 'social_discovery_playbook',
        name: 'Social Discovery Playbook',
        missionType: 'social_signal_hunter',
        primary: 1,
        config: {
            platforms: ['tiktok', 'instagram', 'youtube'],
            cadence: 'hourly',
            evidenceType: 'search_seed'
        },
        playbook: [
            '1) Generar consultas por track y artista para TikTok, Instagram y YouTube.',
            '2) Guardar cada consulta como evidencia trazable en intel_evidence_items.',
            '3) Priorizar videos cortos con señales de UGC (dance, lip sync, fan edit).'
        ].join('\n')
    },
    {
        key: 'rights_registry_resolution',
        name: 'Rights Registry Resolution',
        missionType: 'rights_registry_mapper',
        primary: 1,
        config: {
            societies: ['ASCAP', 'BMI', 'SACM', 'SCD'],
            cadence: 'daily',
            requiresCredential: true
        },
        playbook: [
            '1) Ejecutar escaneo en ASCAP/BMI y guardar posibles matches.',
            '2) Guardar payload, endpoint y evidencia de cada intento.',
            '3) Escalar discrepancias como keypoints para revision legal.'
        ].join('\n')
    },
    {
        key: 'platform_footprint_radar',
        name: 'Platform Footprint Radar',
        missionType: 'platform_footprint_mapper',
        primary: 1,
        config: {
            platforms: ['spotify', 'apple_music', 'youtube_music', 'deezer', 'tidal'],
            cadence: 'daily'
        },
        playbook: [
            '1) Crear seeds por plataforma para cada tema del album.',
            '2) Guardar cada hallazgo en platform_artist_presence con score de confianza.',
            '3) Consolidar duplicados y elevar inconsistencias de metadata.'
        ].join('\n')
    },
    {
        key: 'ailex_briefing_engine',
        name: 'Ailex Briefing Engine',
        missionType: 'facts_keypoints_engine',
        primary: 1,
        config: {
            outputs: ['ailex_brief', 'risk_alert', 'campaign_signal'],
            cadence: 'hourly'
        },
        playbook: [
            '1) Leer evidencia y presencia acumulada en las ultimas 24h.',
            '2) Convertir data en keypoints accionables para Ailex.',
            '3) Marcar severidad y referencias para seguimiento rapido.'
        ].join('\n')
    }
];

async function main() {
    for (const skill of SKILLS) {
        await run(
            `INSERT INTO intel_agent_skills
             (skill_key, skill_name, mission_type, status, playbook_markdown, config_json)
             VALUES (?, ?, ?, 'active', ?, CAST(? AS JSON))
             ON DUPLICATE KEY UPDATE
               skill_name = VALUES(skill_name),
               mission_type = VALUES(mission_type),
               status = 'active',
               playbook_markdown = VALUES(playbook_markdown),
               config_json = CAST(? AS JSON),
               updated_at = CURRENT_TIMESTAMP`,
            [
                skill.key,
                skill.name,
                skill.missionType,
                skill.playbook,
                JSON.stringify(skill.config),
                JSON.stringify(skill.config)
            ]
        );

        await run(
            `INSERT INTO intel_mission_skill_map (mission_id, skill_id, is_primary)
             SELECT m.id, s.id, ?
             FROM intel_agent_missions m
             JOIN intel_agent_skills s ON s.skill_key = ?
             WHERE m.mission_type = ?
             ON DUPLICATE KEY UPDATE
               is_primary = VALUES(is_primary)`,
            [skill.primary, skill.key, skill.missionType]
        );
    }

    console.log(
        JSON.stringify(
            {
                status: 'seeded',
                skills: SKILLS.length
            },
            null,
            2
        )
    );
}

main()
    .catch((error) => {
        console.error('seed-intel-skills error:', error.message);
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
