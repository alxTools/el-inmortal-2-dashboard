const { getOne, run } = require('../config/database');

async function getMissionByType(missionType) {
    const type = String(missionType || '').trim();
    if (!type) {
        throw new Error('missionType is required');
    }

    const mission = await getOne(
        `SELECT id, mission_type, mission_name, status, config_json
         FROM intel_agent_missions
         WHERE mission_type = ?
         LIMIT 1`,
        [type]
    );

    if (!mission) {
        throw new Error(`Mission not found: ${type}. Run npm run intel:seed-missions first.`);
    }

    return mission;
}

async function startMissionRun({ missionType, requestedBy = 'opencode', summary = {} }) {
    const mission = await getMissionByType(missionType);
    const startedAt = new Date();

    const insert = await run(
        `INSERT INTO intel_agent_runs
         (mission_id, run_status, summary_json, error_text, started_at)
         VALUES (?, 'running', CAST(? AS JSON), NULL, ?)`,
        [mission.id, JSON.stringify(summary || {}), startedAt]
    );

    await run(
        `UPDATE intel_agent_missions
         SET status = 'running',
             requested_by_user = ?,
             last_error = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [requestedBy, mission.id]
    );

    return {
        mission,
        runId: insert.lastID || insert.insertId,
        startedAt
    };
}

async function finishMissionRun({ missionId, runId, status = 'success', summary = {}, errorText = null }) {
    const normalizedStatus = String(status || 'success').trim().toLowerCase();
    const missionStatus = normalizedStatus === 'error' ? 'pending' : 'pending';

    await run(
        `UPDATE intel_agent_runs
         SET run_status = ?,
             summary_json = CAST(? AS JSON),
             error_text = ?,
             finished_at = NOW()
         WHERE id = ?`,
        [normalizedStatus, JSON.stringify(summary || {}), errorText || null, runId]
    );

    await run(
        `UPDATE intel_agent_missions
         SET status = ?,
             last_error = ?,
             next_run_at = DATE_ADD(NOW(), INTERVAL 1 HOUR),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [missionStatus, errorText || null, missionId]
    );
}

async function storeEvidenceItem({
    missionId,
    runId,
    platform,
    evidenceType,
    trackId = null,
    trackTitle = null,
    artistName = null,
    externalId = null,
    sourceUrl,
    authorHandle = null,
    postedAt = null,
    metadata = null,
    mediaLocalPath = null,
    ingestStatus = 'collected'
}) {
    await run(
        `INSERT INTO intel_evidence_items
         (mission_id, mission_run_id, platform, evidence_type, track_id, track_title, artist_name, external_id,
          source_url, author_handle, posted_at, metadata_json, media_local_path, ingest_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?)`,
        [
            missionId,
            runId,
            platform,
            evidenceType,
            trackId,
            trackTitle,
            artistName,
            externalId,
            sourceUrl,
            authorHandle,
            postedAt,
            JSON.stringify(metadata || {}),
            mediaLocalPath,
            ingestStatus
        ]
    );
}

module.exports = {
    getMissionByType,
    startMissionRun,
    finishMissionRun,
    storeEvidenceItem
};
