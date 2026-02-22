#!/usr/bin/env node

require('dotenv').config();

const { getAll, closePool } = require('../src/config/database');
const {
    startMissionRun,
    finishMissionRun,
    storeEvidenceItem
} = require('../src/utils/intelAgentRuntime');

function getArgValue(args, name, fallback = '') {
    const idx = args.findIndex((x) => x === `--${name}`);
    if (idx < 0 || idx + 1 >= args.length) return fallback;
    return args[idx + 1];
}

function buildSearchTargets({ artistName, trackTitle }) {
    const query = encodeURIComponent(`${artistName} ${trackTitle}`.trim());
    return [
        {
            platform: 'tiktok',
            sourceUrl: `https://www.tiktok.com/search?q=${query}`,
            evidenceType: 'search_seed'
        },
        {
            platform: 'instagram',
            sourceUrl: `https://www.instagram.com/explore/search/keyword/?q=${query}`,
            evidenceType: 'search_seed'
        },
        {
            platform: 'youtube',
            sourceUrl: `https://www.youtube.com/results?search_query=${query}`,
            evidenceType: 'search_seed'
        }
    ];
}

async function runMission(options = {}) {
    const requestedBy = String(options.requestedBy || 'opencode').trim() || 'opencode';
    const limit = Math.max(1, Math.min(50, Number(options.limit || 21) || 21));
    const artistName = String(options.artistName || process.env.INTEL_ARTIST_NAME || 'Galante el Emperador').trim();

    const { mission, runId } = await startMissionRun({
        missionType: 'social_signal_hunter',
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

        let evidenceCreated = 0;
        for (const track of tracks) {
            if (!track?.title) continue;
            const targets = buildSearchTargets({ artistName, trackTitle: track.title });

            for (const target of targets) {
                await storeEvidenceItem({
                    missionId: mission.id,
                    runId,
                    platform: target.platform,
                    evidenceType: target.evidenceType,
                    trackId: track.id,
                    trackTitle: track.title,
                    artistName,
                    sourceUrl: target.sourceUrl,
                    metadata: {
                        intent: 'ugc_discovery',
                        trackNumber: track.track_number,
                        requestedBy
                    },
                    ingestStatus: 'seeded'
                });
                evidenceCreated += 1;
            }
        }

        const summary = {
            requestedBy,
            trackCount: tracks.length,
            evidenceCreated,
            strategy: 'platform_search_seed_urls'
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
        const message = String(error.message || 'social_scan_failed').slice(0, 1200);
        await finishMissionRun({
            missionId: mission.id,
            runId,
            status: 'error',
            summary: {
                requestedBy,
                limit,
                artistName
            },
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
            console.error('intel-social-scan-once error:', error.message);
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
