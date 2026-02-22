#!/usr/bin/env node

require('dotenv').config();

const { getAll, run, closePool } = require('../src/config/database');
const { startMissionRun, finishMissionRun } = require('../src/utils/intelAgentRuntime');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function platformSeeds(artistName, trackTitle) {
    const query = encodeURIComponent(`${artistName} ${trackTitle}`.trim());
    return [
        { platform: 'spotify', sourceUrl: `https://open.spotify.com/search/${query}`, confidence: 24 },
        { platform: 'apple_music', sourceUrl: `https://music.apple.com/us/search?term=${query}`, confidence: 22 },
        { platform: 'youtube_music', sourceUrl: `https://music.youtube.com/search?q=${query}`, confidence: 20 },
        { platform: 'deezer', sourceUrl: `https://www.deezer.com/search/${query}`, confidence: 18 },
        { platform: 'tidal', sourceUrl: `https://listen.tidal.com/search?q=${query}`, confidence: 16 }
    ];
}

async function runMission(options = {}) {
    const requestedBy = String(options.requestedBy || 'opencode').trim() || 'opencode';
    const limit = Math.max(1, Math.min(50, Number(options.limit || 21) || 21));
    const artistName = String(options.artistName || process.env.INTEL_ARTIST_NAME || 'Galante el Emperador').trim();

    const { mission, runId } = await startMissionRun({
        missionType: 'platform_footprint_mapper',
        requestedBy,
        summary: {
            requestedBy,
            limit,
            artistName,
            mode: 'seed_urls'
        }
    });

    try {
        const safeLimit = Math.max(1, Math.min(50, Number(limit) || 21));
        const tracks = await getAll(
            `SELECT id, track_number, title
             FROM tracks
             ORDER BY track_number ASC
             LIMIT ${safeLimit}`
        );

        let seedsCreated = 0;
        for (const track of tracks) {
            if (!track?.title) continue;
            const targets = platformSeeds(artistName, track.title);

            for (const target of targets) {
                await run(
                    `INSERT INTO platform_artist_presence
                     (platform, artist_profile, track_title, source_url, confidence_score, found_by_mission_id, metadata_json)
                     VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
                    [
                        target.platform,
                        artistName,
                        track.title,
                        target.sourceUrl,
                        target.confidence,
                        mission.id,
                        JSON.stringify({
                            missionRunId: runId,
                            trackId: track.id,
                            trackNumber: track.track_number,
                            sourceLabel: 'platform_seed_builder',
                            requestedBy
                        })
                    ]
                );
                seedsCreated += 1;
            }
        }

        const summary = {
            requestedBy,
            trackCount: tracks.length,
            seedsCreated,
            platforms: 5
        };

        await finishMissionRun({
            missionId: mission.id,
            runId,
            status: 'success',
            summary,
            errorText: null
        });

        return {
            status: 'success',
            missionId: mission.id,
            runId,
            ...summary
        };
    } catch (error) {
        const message = String(error.message || 'footprint_scan_failed').slice(0, 1200);
        await finishMissionRun({
            missionId: mission.id,
            runId,
            status: 'error',
            summary: { requestedBy, limit, artistName },
            errorText: message
        });
        throw error;
    }
}

async function main() {
    const args = process.argv.slice(2);
    const requestedBy = getArgValue(args, 'by', 'opencode');
    const limit = Number(getArgValue(args, 'limit', 21)) || 21;
    const artistName = getArgValue(args, 'artist', process.env.INTEL_ARTIST_NAME || 'Galante el Emperador');

    const result = await runMission({ requestedBy, limit, artistName });
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
    main()
        .catch((error) => {
            console.error('intel-platform-footprint-once error:', error.message);
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
}

module.exports = {
    runMission
};
