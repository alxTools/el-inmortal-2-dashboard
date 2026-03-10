const fs = require('fs');
const { google } = require('googleapis');

const DEFAULT_PR_YOUTUBE_TIME = '20:00';

function parseClientSecret(jsonObj) {
    if (!jsonObj || typeof jsonObj !== 'object') return null;
    if (jsonObj.installed) return jsonObj.installed;
    if (jsonObj.web) return jsonObj.web;
    return null;
}

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value || !String(value).trim()) {
        throw new Error(`Missing env var: ${name}`);
    }
    return String(value).trim();
}

function parseDateText(dateText) {
    const text = String(dateText || '').trim();
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
        throw new Error('invalid_date_format:expected_YYYY-MM-DD');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);

    if (!Number.isInteger(year) || year < 2000 || year > 2200) {
        throw new Error('invalid_date_year');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
        throw new Error('invalid_date_month');
    }
    if (!Number.isInteger(day) || day < 1 || day > 31) {
        throw new Error('invalid_date_day');
    }

    const utcProbe = new Date(Date.UTC(year, month - 1, day));
    if (
        utcProbe.getUTCFullYear() !== year ||
        utcProbe.getUTCMonth() !== month - 1 ||
        utcProbe.getUTCDate() !== day
    ) {
        throw new Error('invalid_date_value');
    }

    return { year, month, day };
}

function parseTimeText(timeText, fallback = DEFAULT_PR_YOUTUBE_TIME) {
    const raw = String(timeText || '').trim();
    const text = raw || fallback;
    const match = text.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) {
        throw new Error('invalid_time_format:expected_HH:mm');
    }
    return `${match[1]}:${match[2]}`;
}

function toYoutubePublishAtFromPuertoRico(dateText, timeText = DEFAULT_PR_YOUTUBE_TIME) {
    const { year, month, day } = parseDateText(dateText);
    const normalizedTime = parseTimeText(timeText);
    const [hour, minute] = normalizedTime.split(':').map(Number);

    // Puerto Rico is AST (UTC-4) all year.
    // Local PR time -> UTC = local + 4h.
    const utcDate = new Date(Date.UTC(year, month - 1, day, hour + 4, minute, 0));
    return utcDate.toISOString();
}

function normalizeVideoId(videoId) {
    const normalized = String(videoId || '').trim();
    if (!/^[A-Za-z0-9_-]{11}$/.test(normalized)) {
        throw new Error('invalid_youtube_video_id');
    }
    return normalized;
}

async function getYoutubeClient() {
    const clientSecretsPath = getRequiredEnv('YT_CLIENT_SECRETS_PATH');
    const tokenPath = getRequiredEnv('YT_TOKEN_FILE_PATH');

    if (!fs.existsSync(clientSecretsPath)) {
        throw new Error(`yt_client_secrets_not_found:${clientSecretsPath}`);
    }
    if (!fs.existsSync(tokenPath)) {
        throw new Error(`yt_token_file_not_found:${tokenPath}`);
    }

    const secretRaw = fs.readFileSync(clientSecretsPath, 'utf8');
    const secretObj = parseClientSecret(JSON.parse(secretRaw));
    if (!secretObj) {
        throw new Error('invalid_yt_client_secrets_json');
    }

    const redirectUri = Array.isArray(secretObj.redirect_uris) && secretObj.redirect_uris.length
        ? secretObj.redirect_uris[0]
        : 'http://localhost';

    const oauth2Client = new google.auth.OAuth2(
        secretObj.client_id,
        secretObj.client_secret,
        redirectUri
    );

    const tokenRaw = fs.readFileSync(tokenPath, 'utf8');
    oauth2Client.setCredentials(JSON.parse(tokenRaw));

    return google.youtube({ version: 'v3', auth: oauth2Client });
}

function buildWritableSnippet(snippet, videoId) {
    const safe = snippet && typeof snippet === 'object' ? snippet : {};
    const out = {
        title: String(safe.title || `Video ${videoId}`).slice(0, 100),
        description: String(safe.description || '').slice(0, 5000),
        categoryId: String(safe.categoryId || '10')
    };

    if (Array.isArray(safe.tags)) {
        out.tags = safe.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
    }
    if (safe.defaultLanguage) {
        out.defaultLanguage = String(safe.defaultLanguage);
    }
    if (safe.defaultAudioLanguage) {
        out.defaultAudioLanguage = String(safe.defaultAudioLanguage);
    }

    return out;
}

function buildWritableStatus(status, publishAt) {
    const safe = status && typeof status === 'object' ? status : {};
    const out = {
        privacyStatus: safe.privacyStatus === 'private' || safe.privacyStatus === 'unlisted'
            ? safe.privacyStatus
            : 'private',
        publishAt
    };

    if (typeof safe.embeddable === 'boolean') {
        out.embeddable = safe.embeddable;
    }
    if (typeof safe.license === 'string' && safe.license) {
        out.license = safe.license;
    }
    if (typeof safe.publicStatsViewable === 'boolean') {
        out.publicStatsViewable = safe.publicStatsViewable;
    }
    if (typeof safe.selfDeclaredMadeForKids === 'boolean') {
        out.selfDeclaredMadeForKids = safe.selfDeclaredMadeForKids;
    }

    return out;
}

function parseGoogleApiError(error) {
    const reason =
        error?.errors?.[0]?.reason ||
        error?.response?.data?.error?.errors?.[0]?.reason ||
        null;
    const message =
        error?.response?.data?.error?.message ||
        error?.message ||
        'unknown_youtube_error';

    return {
        reason: reason ? String(reason) : null,
        message: String(message || 'unknown_youtube_error').slice(0, 800)
    };
}

async function updateYouTubePublishDate({ videoId, date, time = DEFAULT_PR_YOUTUBE_TIME }) {
    const normalizedVideoId = normalizeVideoId(videoId);
    const publishAt = toYoutubePublishAtFromPuertoRico(date, time);
    const youtube = await getYoutubeClient();

    const listResp = await youtube.videos.list({
        part: ['snippet', 'status'],
        id: [normalizedVideoId],
        maxResults: 1
    });

    const item = listResp?.data?.items?.[0];
    if (!item) {
        throw new Error('youtube_video_not_found');
    }

    if (item?.status?.privacyStatus === 'public') {
        throw new Error('youtube_video_is_public_set_private_before_reschedule');
    }

    const snippet = buildWritableSnippet(item.snippet, normalizedVideoId);
    const status = buildWritableStatus(item.status, publishAt);

    try {
        await youtube.videos.update({
            part: ['snippet', 'status'],
            requestBody: {
                id: normalizedVideoId,
                snippet,
                status
            }
        });
    } catch (error) {
        const parsed = parseGoogleApiError(error);
        const reason = parsed.reason ? `${parsed.reason}:` : '';
        throw new Error(`youtube_update_failed:${reason}${parsed.message}`);
    }

    return {
        videoId: normalizedVideoId,
        publishAt,
        privacyStatus: status.privacyStatus
    };
}

module.exports = {
    DEFAULT_PR_YOUTUBE_TIME,
    parseTimeText,
    toYoutubePublishAtFromPuertoRico,
    updateYouTubePublishDate
};
