const fs = require('fs');
const { google } = require('googleapis');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const { getAll, getOne, run, query } = require('../config/database');

const MIN_DESCRIPTION_LENGTH = Number(process.env.YT_AUDIT_MIN_DESCRIPTION_LENGTH || 120);
const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_TAGS_TOTAL_CHARS = 500;
const DEFAULT_TOP_TRAFFIC_LIMIT = Number(process.env.YT_SEO_TOP_TRAFFIC_LIMIT || 50);
const PPLX_API_URL = process.env.PPLX_API_URL || 'https://api.perplexity.ai/chat/completions';
const PPLX_MODEL = process.env.PPLX_MODEL || 'sonar-pro';
const SEO_TEMPLATE_MAX_CHARS = Number(process.env.SEO_PROMPT_TEMPLATE_MAX_CHARS || 12000);

const DEFAULT_CATEGORY_ID = '10';
const DEFAULT_BASE_TAGS = [
    'Galante El Emperador',
    'El Inmortal 2',
    'musica urbana',
    'reggaeton',
    'latin music',
    'video oficial'
];

const DEFAULT_SOCIAL_BLOCK = [
    '----',
    '',
    'Siguenos en redes sociales!',
    'GALANTE EL EMPERADOR',
    'YouTube: https://www.youtube.com/@galanteelemperador',
    'Instagram: https://www.instagram.com/galanteddm',
    'TikTok: https://www.tiktok.com/@galante_elemperador',
    'X (Twitter): https://x.com/galantealx',
    'Facebook: https://www.facebook.com/GalanteElEmperador',
    '',
    '#GalanteElEmperador #ElInmortal2'
].join('\n');

function safeParseJson(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return fallback;
    const text = value.trim();
    if (!text) return fallback;
    try {
        return JSON.parse(text);
    } catch (_) {
        return fallback;
    }
}

function normalizeSpaces(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
}

function normalizeLower(text) {
    return normalizeSpaces(text).toLowerCase();
}

function normalizeTags(tags) {
    if (!Array.isArray(tags)) return [];
    const out = [];
    const seen = new Set();
    for (const raw of tags) {
        const tag = normalizeSpaces(raw);
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
    }
    return out;
}

function tagsAreEqual(a, b) {
    const aa = normalizeTags(a).map((x) => x.toLowerCase());
    const bb = normalizeTags(b).map((x) => x.toLowerCase());
    if (aa.length !== bb.length) return false;
    for (let i = 0; i < aa.length; i += 1) {
        if (aa[i] !== bb[i]) return false;
    }
    return true;
}

function clampTags(tags) {
    const normalized = normalizeTags(tags);
    const out = [];
    let total = 0;
    for (const tag of normalized) {
        const next = total + tag.length + (out.length ? 1 : 0);
        if (next > MAX_TAGS_TOTAL_CHARS) break;
        out.push(tag);
        total = next;
    }
    return out;
}

function clampMetadata(title, description, tags) {
    return {
        title: String(title || '').slice(0, MAX_TITLE_LENGTH),
        description: String(description || '').slice(0, MAX_DESCRIPTION_LENGTH),
        tags: clampTags(tags)
    };
}

function fallbackTitleFromVideo(video) {
    const title = normalizeSpaces(video?.title);
    if (title) return title;
    return `Galante El Emperador - Video ${video?.videoId || ''}`.trim();
}

function fallbackDescription(video) {
    const title = fallbackTitleFromVideo(video);
    const current = String(video?.description || '').trim();
    if (current.length >= MIN_DESCRIPTION_LENGTH) return current;
    if (!current) {
        return `---\n${title}\n---\n\n${DEFAULT_SOCIAL_BLOCK}`;
    }
    return `${current}\n\n${DEFAULT_SOCIAL_BLOCK}`;
}

function tagsFromTitle(title) {
    const clean = String(title || '')
        .replace(/\[[^\]]*\]/g, ' ')
        .replace(/\([^)]*\)/g, ' ');
    const words = clean.split(/[^A-Za-z0-9]+/).filter(Boolean);
    const phrases = [];
    if (words.length >= 2) phrases.push(`${words[0]} ${words[1]}`);
    if (words.length >= 3) phrases.push(`${words[0]} ${words[1]} ${words[2]}`);
    return normalizeTags([...DEFAULT_BASE_TAGS, ...phrases]);
}

function fallbackTags(video) {
    const existing = normalizeTags(video?.tags || []);
    if (existing.length) return existing;
    return tagsFromTitle(video?.title || '');
}

function ensureMinDescription(description, fallbackTitle) {
    const current = String(description || '').trim();
    if (current.length >= MIN_DESCRIPTION_LENGTH) return current;
    if (!current) {
        return `---\n${fallbackTitle || 'Video'}\n---\n\n${DEFAULT_SOCIAL_BLOCK}`;
    }
    return `${current}\n\n${DEFAULT_SOCIAL_BLOCK}`;
}

function readSeoPromptTemplate() {
    const path = String(process.env.SEO_PROMPT_TEMPLATE_PATH || '').trim();
    if (!path) return { path: '', content: '' };
    if (!fs.existsSync(path)) return { path, content: '' };

    const raw = fs.readFileSync(path, 'utf8');
    const content = String(raw || '').slice(0, Math.max(1000, SEO_TEMPLATE_MAX_CHARS));
    return { path, content };
}

function parseTagsLoose(input) {
    if (Array.isArray(input)) return normalizeTags(input);
    if (typeof input !== 'string') return [];
    return normalizeTags(input.split(/[\n,]+/).map((x) => x.trim()));
}

function extractJsonObjectFromText(text) {
    const raw = String(text || '').trim();
    if (!raw) return null;

    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidates = [];
    if (fenced && fenced[1]) candidates.push(fenced[1]);
    candidates.push(raw);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === 'object') return parsed;
        } catch (_) {
            // keep trying
        }
    }

    return null;
}

function normalizeSeoRecommendation(parsed, item) {
    const rawTitle = parsed?.optimized_title || parsed?.title || item.recommendedTitle || item.titleCurrent;
    const rawDescription = parsed?.optimized_description || parsed?.description || item.recommendedDescription || item.descriptionCurrent;
    const rawCategoryId = parsed?.category_id || parsed?.categoryId || item.recommendedCategoryId || DEFAULT_CATEGORY_ID;
    const rawTags = parsed?.tags || parsed?.optimized_tags || item.recommendedTags || item.tagsCurrent || [];

    const clamped = clampMetadata(
        String(rawTitle || ''),
        ensureMinDescription(rawDescription, item.titleCurrent || item.videoId),
        parseTagsLoose(rawTags)
    );

    return {
        title: clamped.title,
        description: clamped.description,
        categoryId: String(rawCategoryId || DEFAULT_CATEGORY_ID),
        tags: clamped.tags
    };
}

function buildSeoPromptForItem(item, templateContent) {
    const templateBlock = templateContent
        ? `\n\nSEO STYLE TEMPLATE (follow structure/tone, but adapt to THIS specific video):\n${templateContent}`
        : '';

    return [
        'Optimize this YouTube video metadata for SEO and CTR for GALANTE EL EMPERADOR channel.',
        'Return ONLY valid JSON with keys: title, description, tags, categoryId, rationale.',
        '',
        `Video ID: ${item.videoId}`,
        `Current title: ${item.titleCurrent}`,
        `Current description length: ${item.descriptionLenCurrent}`,
        `Current category: ${item.categoryCurrent}`,
        `Current tags: ${(item.tagsCurrent || []).join(', ')}`,
        `Issues detected: ${(item.issues || []).join(', ') || 'none'}`,
        `Traffic stats: views=${item.viewCount || 0}, likes=${item.likeCount || 0}, comments=${item.commentCount || 0}`,
        '',
        'Rules:',
        '- Keep language Spanish-first with Latin urban/reggaeton context.',
        '- Keep title <= 100 chars; description <= 5000 chars; tags total <= 500 chars.',
        '- Include artist and track intent; avoid clickbait and avoid false claims.',
        '- Keep categoryId as 10 (Music) unless there is a very strong reason.',
        '- Description should include social block and useful search intent terms.',
        templateBlock
    ].join('\n');
}

async function requestPerplexitySeoOptimization({ apiKey, model, prompt }) {
    const response = await fetch(PPLX_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model,
            temperature: 0.2,
            messages: [
                {
                    role: 'system',
                    content: 'You are a senior YouTube SEO strategist. Respond with strict JSON only.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ]
        })
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        const apiMessage = payload?.error?.message || payload?.message || `http_${response.status}`;
        throw new Error(`perplexity_error:${apiMessage}`);
    }

    const text = payload?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) {
        throw new Error('perplexity_error:empty_response');
    }

    return String(text);
}

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

function resolveYoutubeConfig() {
    const clientSecretsPath = getRequiredEnv('YT_CLIENT_SECRETS_PATH');
    const tokenPath = getRequiredEnv('YT_TOKEN_FILE_PATH');

    if (!fs.existsSync(clientSecretsPath)) {
        throw new Error(`YT client secrets file not found: ${clientSecretsPath}`);
    }
    if (!fs.existsSync(tokenPath)) {
        throw new Error(`YT token file not found: ${tokenPath}`);
    }

    return { clientSecretsPath, tokenPath };
}

async function getYoutubeClient() {
    const { clientSecretsPath, tokenPath } = resolveYoutubeConfig();

    const secretRaw = fs.readFileSync(clientSecretsPath, 'utf8');
    const secretObj = parseClientSecret(JSON.parse(secretRaw));
    if (!secretObj) {
        throw new Error('Invalid YouTube OAuth client secrets JSON. Expected installed/web format.');
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

async function ensureYoutubeMetadataTables() {
    await query(`
        CREATE TABLE IF NOT EXISTS youtube_video_metadata_targets (
            id BIGINT NOT NULL AUTO_INCREMENT,
            video_id VARCHAR(32) NOT NULL,
            track_code VARCHAR(64) NULL,
            target_title VARCHAR(500) NOT NULL,
            target_description LONGTEXT NOT NULL,
            target_category_id VARCHAR(16) NOT NULL DEFAULT '10',
            target_tags_json JSON NULL,
            source_label VARCHAR(120) NULL,
            active TINYINT(1) NOT NULL DEFAULT 1,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_video_id (video_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_channel_audit_runs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            channel_id VARCHAR(128) NOT NULL,
            channel_title VARCHAR(255) NULL,
            inspected_count INT NOT NULL DEFAULT 0,
            needs_fix_count INT NOT NULL DEFAULT 0,
            issue_counts_json JSON NULL,
            created_by_user VARCHAR(128) NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_channel_created (channel_id, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_channel_audit_items (
            id BIGINT NOT NULL AUTO_INCREMENT,
            run_id BIGINT NOT NULL,
            channel_id VARCHAR(128) NOT NULL,
            video_id VARCHAR(32) NOT NULL,
            published_at DATETIME NULL,
            privacy_status VARCHAR(40) NULL,
            title_current VARCHAR(500) NULL,
            description_current LONGTEXT NULL,
            category_current VARCHAR(16) NULL,
            tags_current_json JSON NULL,
            issues_json JSON NOT NULL,
            needs_fix TINYINT(1) NOT NULL DEFAULT 0,
            target_title VARCHAR(500) NULL,
            target_description LONGTEXT NULL,
            target_category_id VARCHAR(16) NULL,
            target_tags_json JSON NULL,
            recommended_title VARCHAR(500) NULL,
            recommended_description LONGTEXT NULL,
            recommended_category_id VARCHAR(16) NULL,
            recommended_tags_json JSON NULL,
            update_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            update_message TEXT NULL,
            updated_at DATETIME NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_run (run_id),
            KEY idx_video (video_id),
            CONSTRAINT fk_youtube_audit_run FOREIGN KEY (run_id)
                REFERENCES youtube_channel_audit_runs(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_channel_update_logs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            run_id BIGINT NULL,
            channel_id VARCHAR(128) NULL,
            video_id VARCHAR(32) NOT NULL,
            action_name VARCHAR(64) NOT NULL,
            status VARCHAR(32) NOT NULL,
            message TEXT NULL,
            payload_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_video (video_id),
            KEY idx_run (run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_seo_optimization_runs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            audit_run_id BIGINT NOT NULL,
            channel_id VARCHAR(128) NOT NULL,
            channel_title VARCHAR(255) NULL,
            model_name VARCHAR(120) NOT NULL,
            top_limit INT NOT NULL,
            only_needs_fix TINYINT(1) NOT NULL DEFAULT 1,
            template_path VARCHAR(500) NULL,
            created_by_user VARCHAR(128) NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'running',
            summary_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_audit_run (audit_run_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_seo_optimization_items (
            id BIGINT NOT NULL AUTO_INCREMENT,
            seo_run_id BIGINT NOT NULL,
            audit_item_id BIGINT NOT NULL,
            video_id VARCHAR(32) NOT NULL,
            traffic_rank INT NOT NULL,
            view_count BIGINT NULL,
            like_count BIGINT NULL,
            comment_count BIGINT NULL,
            needs_fix TINYINT(1) NOT NULL DEFAULT 1,
            issues_json JSON NULL,
            prompt_text LONGTEXT NULL,
            response_text LONGTEXT NULL,
            parse_status VARCHAR(32) NOT NULL DEFAULT 'pending',
            parse_message TEXT NULL,
            optimized_title VARCHAR(500) NULL,
            optimized_description LONGTEXT NULL,
            optimized_category_id VARCHAR(16) NULL,
            optimized_tags_json JSON NULL,
            target_upserted TINYINT(1) NOT NULL DEFAULT 0,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NULL,
            PRIMARY KEY (id),
            KEY idx_seo_run (seo_run_id),
            KEY idx_video (video_id),
            CONSTRAINT fk_youtube_seo_run FOREIGN KEY (seo_run_id)
                REFERENCES youtube_seo_optimization_runs(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_ops_daily_reports (
            id BIGINT NOT NULL AUTO_INCREMENT,
            report_date DATE NOT NULL,
            generated_by_user VARCHAR(128) NULL,
            summary_json JSON NOT NULL,
            report_markdown LONGTEXT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_report_date (report_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await query(`
        CREATE TABLE IF NOT EXISTS youtube_ops_email_logs (
            id BIGINT NOT NULL AUTO_INCREMENT,
            report_date DATE NOT NULL,
            report_id BIGINT NULL,
            sent_by_user VARCHAR(128) NULL,
            recipients_to TEXT NULL,
            recipients_cc TEXT NULL,
            recipients_bcc TEXT NULL,
            subject_text VARCHAR(255) NOT NULL,
            status VARCHAR(32) NOT NULL,
            message_text TEXT NULL,
            payload_json JSON NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY idx_report_date (report_date),
            KEY idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    await ensureColumnExists('youtube_channel_audit_items', 'view_count', 'BIGINT NULL AFTER privacy_status');
    await ensureColumnExists('youtube_channel_audit_items', 'like_count', 'BIGINT NULL AFTER view_count');
    await ensureColumnExists('youtube_channel_audit_items', 'comment_count', 'BIGINT NULL AFTER like_count');
    await ensureColumnExists('youtube_channel_audit_items', 'traffic_score', 'BIGINT NULL AFTER comment_count');
}

async function ensureColumnExists(tableName, columnName, columnDefSql) {
    const row = await getOne(
        `SELECT COUNT(*) AS c
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?`,
        [tableName, columnName]
    );

    if (Number(row?.c || 0) > 0) return;

    await query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefSql}`);
}

function chunkArray(items, size) {
    const out = [];
    for (let i = 0; i < items.length; i += size) {
        out.push(items.slice(i, i + size));
    }
    return out;
}

async function fetchChannelData(youtube) {
    const channelsResp = await youtube.channels.list({
        part: ['snippet', 'contentDetails'],
        mine: true,
        maxResults: 1
    });

    const channel = channelsResp?.data?.items?.[0];
    if (!channel) {
        throw new Error('No channel found for authenticated account.');
    }

    const uploadsPlaylistId = channel?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
        throw new Error('Could not find uploads playlist for channel.');
    }

    const videoIds = [];
    let pageToken = null;

    do {
        const playlistResp = await youtube.playlistItems.list({
            part: ['contentDetails'],
            playlistId: uploadsPlaylistId,
            maxResults: 50,
            pageToken: pageToken || undefined
        });

        for (const item of playlistResp?.data?.items || []) {
            const id = item?.contentDetails?.videoId;
            if (id) videoIds.push(id);
        }

        pageToken = playlistResp?.data?.nextPageToken || null;
    } while (pageToken);

    const uniqueVideoIds = [...new Set(videoIds)];

    const details = [];
    for (const chunk of chunkArray(uniqueVideoIds, 50)) {
        const videosResp = await youtube.videos.list({
            part: ['snippet', 'status', 'statistics'],
            id: chunk.join(','),
            maxResults: 50
        });
        for (const video of videosResp?.data?.items || []) {
            const views = Number(video?.statistics?.viewCount || 0);
            const likes = Number(video?.statistics?.likeCount || 0);
            const comments = Number(video?.statistics?.commentCount || 0);
            details.push({
                videoId: video.id,
                title: video?.snippet?.title || '',
                description: video?.snippet?.description || '',
                categoryId: String(video?.snippet?.categoryId || ''),
                tags: Array.isArray(video?.snippet?.tags) ? video.snippet.tags : [],
                publishedAt: video?.snippet?.publishedAt || null,
                privacyStatus: video?.status?.privacyStatus || '',
                viewCount: views,
                likeCount: likes,
                commentCount: comments,
                trafficScore: views + (likes * 20) + (comments * 40)
            });
        }
    }

    details.sort((a, b) => {
        const ta = new Date(a.publishedAt || 0).getTime();
        const tb = new Date(b.publishedAt || 0).getTime();
        return tb - ta;
    });

    return {
        channelId: channel.id,
        channelTitle: channel?.snippet?.title || '',
        videos: details
    };
}

async function getTargetsMap(videoIds) {
    if (!videoIds.length) return new Map();
    const map = new Map();

    for (const chunk of chunkArray(videoIds, 200)) {
        const placeholders = chunk.map(() => '?').join(',');
        const rows = await getAll(
            `SELECT video_id, target_title, target_description, target_category_id, target_tags_json, source_label
             FROM youtube_video_metadata_targets
             WHERE active = 1 AND video_id IN (${placeholders})`,
            chunk
        );

        for (const row of rows) {
            map.set(String(row.video_id), {
                title: row.target_title || '',
                description: row.target_description || '',
                categoryId: String(row.target_category_id || DEFAULT_CATEGORY_ID),
                tags: normalizeTags(safeParseJson(row.target_tags_json, [])),
                source: row.source_label || 'db_target'
            });
        }
    }

    return map;
}

function evaluateVideo(video, target) {
    const current = {
        title: normalizeSpaces(video.title),
        description: String(video.description || ''),
        categoryId: String(video.categoryId || ''),
        tags: normalizeTags(video.tags || [])
    };

    const hasTarget = !!target;
    const recommended = {
        title: hasTarget ? target.title : fallbackTitleFromVideo(video),
        description: hasTarget ? target.description : fallbackDescription(video),
        categoryId: hasTarget ? String(target.categoryId || DEFAULT_CATEGORY_ID) : DEFAULT_CATEGORY_ID,
        tags: hasTarget ? normalizeTags(target.tags || []) : fallbackTags(video)
    };

    const issues = [];

    if (hasTarget) {
        if (normalizeLower(current.title) !== normalizeLower(target.title)) issues.push('target_title_mismatch');
        if (normalizeLower(current.description) !== normalizeLower(target.description)) issues.push('target_description_mismatch');
        if (String(current.categoryId || '') !== String(target.categoryId || DEFAULT_CATEGORY_ID)) issues.push('target_category_mismatch');
        if (!tagsAreEqual(current.tags, target.tags || [])) issues.push('target_tags_mismatch');
    } else {
        if (!current.title) issues.push('title_missing');
        if (current.description.length < MIN_DESCRIPTION_LENGTH) issues.push('description_short');
        if (String(current.categoryId || '') !== DEFAULT_CATEGORY_ID) issues.push('category_not_music');
        if (!current.tags.length) issues.push('tags_missing');
    }

    const clamped = clampMetadata(recommended.title, recommended.description, recommended.tags);

    return {
        needsFix: issues.length > 0,
        issues,
        targetSource: hasTarget ? (target.source || 'db_target') : null,
        current,
        recommended: {
            title: clamped.title,
            description: clamped.description,
            categoryId: String(recommended.categoryId || DEFAULT_CATEGORY_ID),
            tags: clamped.tags
        }
    };
}

function countIssues(items) {
    const counts = {};
    for (const item of items) {
        for (const issue of item.issues || []) {
            counts[issue] = (counts[issue] || 0) + 1;
        }
    }
    return counts;
}

async function inspectYoutubeChannelAndStore({ requestedBy = 'dashboard' } = {}) {
    await ensureYoutubeMetadataTables();

    const youtube = await getYoutubeClient();
    const channelData = await fetchChannelData(youtube);
    const targets = await getTargetsMap(channelData.videos.map((v) => v.videoId));

    const evaluated = channelData.videos.map((video) => {
        const target = targets.get(video.videoId) || null;
        const evalRow = evaluateVideo(video, target);
        return { video, ...evalRow };
    });

    const needsFixCount = evaluated.filter((row) => row.needsFix).length;
    const issueCounts = countIssues(evaluated);

    const runInsert = await run(
        `INSERT INTO youtube_channel_audit_runs
         (channel_id, channel_title, inspected_count, needs_fix_count, issue_counts_json, created_by_user)
         VALUES (?, ?, ?, ?, CAST(? AS JSON), ?)`,
        [
            channelData.channelId,
            channelData.channelTitle,
            evaluated.length,
            needsFixCount,
            JSON.stringify(issueCounts),
            requestedBy
        ]
    );

    const runId = runInsert.lastID || runInsert.insertId;

    for (const row of evaluated) {
        const publishedAt = row.video.publishedAt ? new Date(row.video.publishedAt) : null;
        await run(
            `INSERT INTO youtube_channel_audit_items
             (run_id, channel_id, video_id, published_at, privacy_status, view_count, like_count, comment_count, traffic_score,
              title_current, description_current, category_current, tags_current_json,
              issues_json, needs_fix, target_title, target_description, target_category_id, target_tags_json,
              recommended_title, recommended_description, recommended_category_id, recommended_tags_json)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CAST(? AS JSON), ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, CAST(? AS JSON))`,
            [
                runId,
                channelData.channelId,
                row.video.videoId,
                publishedAt,
                row.video.privacyStatus || null,
                Number(row.video.viewCount || 0),
                Number(row.video.likeCount || 0),
                Number(row.video.commentCount || 0),
                Number(row.video.trafficScore || 0),
                row.current.title,
                row.current.description,
                row.current.categoryId,
                JSON.stringify(row.current.tags || []),
                JSON.stringify(row.issues || []),
                row.needsFix ? 1 : 0,
                row.targetSource ? row.recommended.title : null,
                row.targetSource ? row.recommended.description : null,
                row.targetSource ? row.recommended.categoryId : null,
                JSON.stringify(row.targetSource ? (row.recommended.tags || []) : []),
                row.recommended.title,
                row.recommended.description,
                row.recommended.categoryId,
                JSON.stringify(row.recommended.tags || [])
            ]
        );
    }

    return {
        run: {
            id: runId,
            channelId: channelData.channelId,
            channelTitle: channelData.channelTitle,
            inspectedCount: evaluated.length,
            needsFixCount,
            issueCounts,
            createdBy: requestedBy
        }
    };
}

function parseAuditItemRow(row) {
    return {
        id: row.id,
        runId: row.run_id,
        videoId: row.video_id,
        publishedAt: row.published_at,
        privacyStatus: row.privacy_status,
        viewCount: Number(row.view_count || 0),
        likeCount: Number(row.like_count || 0),
        commentCount: Number(row.comment_count || 0),
        trafficScore: Number(row.traffic_score || 0),
        titleCurrent: row.title_current || '',
        descriptionCurrent: row.description_current || '',
        descriptionLenCurrent: String(row.description_current || '').length,
        categoryCurrent: String(row.category_current || ''),
        tagsCurrent: normalizeTags(safeParseJson(row.tags_current_json, [])),
        issues: safeParseJson(row.issues_json, []),
        needsFix: !!row.needs_fix,
        targetTitle: row.target_title || null,
        targetDescription: row.target_description || null,
        targetCategoryId: row.target_category_id || null,
        targetTags: normalizeTags(safeParseJson(row.target_tags_json, [])),
        recommendedTitle: row.recommended_title || '',
        recommendedDescription: row.recommended_description || '',
        recommendedCategoryId: row.recommended_category_id || DEFAULT_CATEGORY_ID,
        recommendedTags: normalizeTags(safeParseJson(row.recommended_tags_json, [])),
        updateStatus: row.update_status || 'pending',
        updateMessage: row.update_message || ''
    };
}

async function getYoutubeAuditDashboardData(runId = null, limit = 250) {
    await ensureYoutubeMetadataTables();

    let run = null;
    if (runId) {
        run = await getOne('SELECT * FROM youtube_channel_audit_runs WHERE id = ?', [runId]);
    } else {
        run = await getOne('SELECT * FROM youtube_channel_audit_runs ORDER BY id DESC LIMIT 1');
    }

    if (!run) {
        return {
            run: null,
            items: [],
            hasData: false
        };
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit || 250)));

    const rows = await getAll(
        `SELECT * FROM youtube_channel_audit_items
         WHERE run_id = ?
         ORDER BY needs_fix DESC, published_at DESC, id DESC
         LIMIT ${safeLimit}`,
        [run.id]
    );

    const items = rows.map(parseAuditItemRow);
    return {
        hasData: true,
        run: {
            id: run.id,
            channelId: run.channel_id,
            channelTitle: run.channel_title,
            inspectedCount: run.inspected_count,
            needsFixCount: run.needs_fix_count,
            issueCounts: safeParseJson(run.issue_counts_json, {}),
            createdBy: run.created_by_user,
            createdAt: run.created_at
        },
        items
    };
}

async function upsertYoutubeMetadataTarget({
    videoId,
    title,
    description,
    categoryId,
    tags,
    sourceLabel
}) {
    const tagsJson = JSON.stringify(normalizeTags(tags || []));

    await run(
        `INSERT INTO youtube_video_metadata_targets
         (video_id, target_title, target_description, target_category_id, target_tags_json, source_label, active)
         VALUES (?, ?, ?, ?, CAST(? AS JSON), ?, 1)
         ON DUPLICATE KEY UPDATE
           target_title = VALUES(target_title),
           target_description = VALUES(target_description),
           target_category_id = VALUES(target_category_id),
           target_tags_json = CAST(? AS JSON),
           source_label = VALUES(source_label),
           active = 1,
           updated_at = NOW()`,
        [
            String(videoId || '').trim(),
            String(title || ''),
            String(description || ''),
            String(categoryId || DEFAULT_CATEGORY_ID),
            tagsJson,
            String(sourceLabel || 'perplexity_seo'),
            tagsJson
        ]
    );
}

async function optimizeTopTrafficVideosAndStoreTargets({
    runId = null,
    limit = DEFAULT_TOP_TRAFFIC_LIMIT,
    onlyNeedsFix = true,
    requestedBy = 'dashboard'
} = {}) {
    await ensureYoutubeMetadataTables();

    const runRow = runId
        ? await getOne('SELECT * FROM youtube_channel_audit_runs WHERE id = ?', [runId])
        : await getOne('SELECT * FROM youtube_channel_audit_runs ORDER BY id DESC LIMIT 1');

    if (!runRow) {
        throw new Error('No audit run available for SEO optimization.');
    }

    const apiKey = getRequiredEnv('PPLX_API_KEY');
    const model = String(process.env.PPLX_MODEL || PPLX_MODEL).trim() || PPLX_MODEL;
    const template = readSeoPromptTemplate();

    const safeLimit = Math.max(1, Math.min(200, Number(limit || DEFAULT_TOP_TRAFFIC_LIMIT)));
    let sql = 'SELECT * FROM youtube_channel_audit_items WHERE run_id = ?';
    const params = [runRow.id];
    if (onlyNeedsFix) {
        sql += ' AND needs_fix = 1';
    }
    sql += ` ORDER BY COALESCE(view_count, 0) DESC, COALESCE(like_count, 0) DESC, COALESCE(comment_count, 0) DESC, id ASC LIMIT ${safeLimit}`;

    const rows = await getAll(sql, params);
    if (!rows.length) {
        return {
            seoRunId: null,
            auditRunId: runRow.id,
            processed: 0,
            optimized: 0,
            failed: 0,
            targetUpserted: 0,
            message: 'No candidate videos found for optimization.'
        };
    }

    const hasTrafficData = rows.some((row) =>
        Number(row.view_count || 0) > 0 || Number(row.like_count || 0) > 0 || Number(row.comment_count || 0) > 0
    );

    if (!hasTrafficData) {
        throw new Error('traffic_data_unavailable_for_run: run a fresh inspect after YouTube quota reset');
    }

    const seoRunInsert = await run(
        `INSERT INTO youtube_seo_optimization_runs
         (audit_run_id, channel_id, channel_title, model_name, top_limit, only_needs_fix, template_path, created_by_user, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'running')`,
        [
            runRow.id,
            runRow.channel_id,
            runRow.channel_title,
            model,
            safeLimit,
            onlyNeedsFix ? 1 : 0,
            template.path || null,
            requestedBy
        ]
    );

    const seoRunId = seoRunInsert.lastID || seoRunInsert.insertId;

    let optimized = 0;
    let failed = 0;
    let targetUpserted = 0;

    for (let i = 0; i < rows.length; i += 1) {
        const item = parseAuditItemRow(rows[i]);
        const trafficRank = i + 1;
        const prompt = buildSeoPromptForItem(item, template.content);
        let responseText = '';

        try {
            responseText = await requestPerplexitySeoOptimization({ apiKey, model, prompt });
            const parsed = extractJsonObjectFromText(responseText);
            if (!parsed) {
                throw new Error('seo_json_parse_failed');
            }

            const normalized = normalizeSeoRecommendation(parsed, item);
            const sourceLabel = `perplexity:${model}:seo_run_${seoRunId}`;

            await upsertYoutubeMetadataTarget({
                videoId: item.videoId,
                title: normalized.title,
                description: normalized.description,
                categoryId: normalized.categoryId,
                tags: normalized.tags,
                sourceLabel
            });

            optimized += 1;
            targetUpserted += 1;

            await run(
                `INSERT INTO youtube_seo_optimization_items
                 (seo_run_id, audit_item_id, video_id, traffic_rank, view_count, like_count, comment_count,
                  needs_fix, issues_json, prompt_text, response_text, parse_status, parse_message,
                  optimized_title, optimized_description, optimized_category_id, optimized_tags_json,
                  target_upserted, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, 'optimized', ?, ?, ?, ?, CAST(? AS JSON), 1, NOW())`,
                [
                    seoRunId,
                    item.id,
                    item.videoId,
                    trafficRank,
                    item.viewCount,
                    item.likeCount,
                    item.commentCount,
                    item.needsFix ? 1 : 0,
                    JSON.stringify(item.issues || []),
                    prompt,
                    responseText,
                    'ok',
                    normalized.title,
                    normalized.description,
                    normalized.categoryId,
                    JSON.stringify(normalized.tags || [])
                ]
            );
        } catch (error) {
            failed += 1;
            await run(
                `INSERT INTO youtube_seo_optimization_items
                 (seo_run_id, audit_item_id, video_id, traffic_rank, view_count, like_count, comment_count,
                  needs_fix, issues_json, prompt_text, response_text, parse_status, parse_message,
                  optimized_title, optimized_description, optimized_category_id, optimized_tags_json,
                  target_upserted, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, 'error', ?, NULL, NULL, NULL, CAST(? AS JSON), 0, NOW())`,
                [
                    seoRunId,
                    item.id,
                    item.videoId,
                    trafficRank,
                    item.viewCount,
                    item.likeCount,
                    item.commentCount,
                    item.needsFix ? 1 : 0,
                    JSON.stringify(item.issues || []),
                    prompt,
                    responseText,
                    String(error.message || 'optimization_failed').slice(0, 1000),
                    JSON.stringify([])
                ]
            );
        }
    }

    const summary = {
        auditRunId: runRow.id,
        processed: rows.length,
        optimized,
        failed,
        targetUpserted,
        onlyNeedsFix: !!onlyNeedsFix,
        model,
        templatePath: template.path || null
    };

    await run(
        `UPDATE youtube_seo_optimization_runs
         SET status = ?, summary_json = CAST(? AS JSON), completed_at = NOW()
         WHERE id = ?`,
        [failed ? 'completed_with_errors' : 'completed', JSON.stringify(summary), seoRunId]
    );

    return {
        seoRunId,
        ...summary
    };
}

async function optimizeTopTrafficAndApplyUpdates({
    runId = null,
    limit = DEFAULT_TOP_TRAFFIC_LIMIT,
    onlyNeedsFix = true,
    requestedBy = 'dashboard'
} = {}) {
    const seoResult = await optimizeTopTrafficVideosAndStoreTargets({
        runId,
        limit,
        onlyNeedsFix,
        requestedBy
    });

    if (!seoResult?.seoRunId || Number(seoResult.optimized || 0) <= 0) {
        return {
            ...seoResult,
            autoApply: {
                processed: 0,
                updated: 0,
                skipped: 0,
                failed: 0,
                reason: 'no_optimized_targets'
            }
        };
    }

    const optimizedRows = await getAll(
        `SELECT video_id
         FROM youtube_seo_optimization_items
         WHERE seo_run_id = ? AND parse_status = 'optimized'
         ORDER BY traffic_rank ASC, id ASC`,
        [seoResult.seoRunId]
    );

    const selectedVideoIds = optimizedRows
        .map((row) => String(row.video_id || '').trim())
        .filter(Boolean);

    if (!selectedVideoIds.length) {
        return {
            ...seoResult,
            autoApply: {
                processed: 0,
                updated: 0,
                skipped: 0,
                failed: 0,
                reason: 'optimized_rows_missing_video_ids'
            }
        };
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit || selectedVideoIds.length)));

    const updateResult = await applyYoutubeAuditUpdates({
        runId: seoResult.auditRunId,
        requestedBy,
        mode: 'target_only',
        onlyNeedsFix,
        limit: Math.min(safeLimit, selectedVideoIds.length),
        selectedVideoIds,
        protectMainHeuristic: true
    });

    return {
        ...seoResult,
        autoApply: {
            ...updateResult,
            selectedVideoIds: selectedVideoIds.length
        }
    };
}

function normalizeDateInput(value) {
    const text = String(value || '').trim();
    if (!text) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
        throw new Error(`invalid_date_format:${text} (expected YYYY-MM-DD)`);
    }
    return text;
}

function normalizeDayValue(value) {
    if (!value) return '';
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value);
    const m = text.match(/(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const dt = new Date(text);
    if (!Number.isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
    return text.slice(0, 10);
}

function buildDateWhereClause(fromDate, toDate) {
    const from = normalizeDateInput(fromDate);
    const to = normalizeDateInput(toDate);
    let clause = '';
    const params = [];

    if (from) {
        clause += ' AND DATE(created_at) >= ?';
        params.push(from);
    }
    if (to) {
        clause += ' AND DATE(created_at) <= ?';
        params.push(to);
    }

    return { clause, params, from, to };
}

function renderDailyReportMarkdown(report) {
    const lines = [];
    lines.push(`# YouTube Ops Daily Report (${report.reportDate})`);
    lines.push('');
    lines.push(`Generated at: ${report.generatedAt}`);
    lines.push(`Range: ${report.range.from || 'start'} to ${report.range.to || report.reportDate}`);
    lines.push('');
    lines.push('## Totals');
    lines.push(`- Audit runs: ${report.totals.auditRuns}`);
    lines.push(`- Videos inspected: ${report.totals.videosInspected}`);
    lines.push(`- Videos with issues: ${report.totals.videosNeedsFix}`);
    lines.push(`- Metadata updates: updated=${report.totals.updated}, skipped=${report.totals.skipped}, error=${report.totals.error}`);
    lines.push(`- SEO runs: ${report.totals.seoRuns} (completed=${report.totals.seoCompleted}, completed_with_errors=${report.totals.seoCompletedWithErrors})`);
    lines.push(`- Active DB targets: ${report.totals.activeTargets}`);
    lines.push('');
    lines.push('## Daily Breakdown');

    for (const day of report.days) {
        lines.push(
            `- ${day.day}: audits=${day.auditRuns}, inspected=${day.inspected}, needs_fix=${day.needsFix}, updates(u/s/e)=${day.updated}/${day.skipped}/${day.error}, seo_runs=${day.seoRuns}, snapshots=${day.snapshots}`
        );
    }

    if (report.latestRun) {
        lines.push('');
        lines.push('## Latest Audit Run');
        lines.push(`- Run ${report.latestRun.id} | channel=${report.latestRun.channelTitle || report.latestRun.channelId}`);
        lines.push(`- inspected=${report.latestRun.inspectedCount} | needs_fix=${report.latestRun.needsFixCount}`);
        lines.push(`- created_at=${report.latestRun.createdAt}`);
    }

    return lines.join('\n');
}

async function buildYoutubeOpsDailyReport({ fromDate = '', toDate = '' } = {}) {
    await ensureYoutubeMetadataTables();

    const { clause, params, from, to } = buildDateWhereClause(fromDate, toDate);

    const auditRows = await getAll(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS audit_runs,
                SUM(inspected_count) AS inspected_total,
                SUM(needs_fix_count) AS needs_fix_total
         FROM youtube_channel_audit_runs
         WHERE 1 = 1 ${clause}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        params
    );

    const updateRows = await getAll(
        `SELECT DATE(created_at) AS day,
                SUM(CASE WHEN status = 'updated' THEN 1 ELSE 0 END) AS updated_count,
                SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped_count,
                SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error_count
         FROM youtube_channel_update_logs
         WHERE 1 = 1 ${clause}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        params
    );

    const seoRows = await getAll(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS seo_runs,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS seo_completed,
                SUM(CASE WHEN status = 'completed_with_errors' THEN 1 ELSE 0 END) AS seo_completed_with_errors
         FROM youtube_seo_optimization_runs
         WHERE 1 = 1 ${clause}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        params
    );

    const snapshotRows = await getAll(
        `SELECT DATE(created_at) AS day,
                COUNT(*) AS snapshots
         FROM youtube_ops_snapshots
         WHERE 1 = 1 ${clause}
         GROUP BY DATE(created_at)
         ORDER BY day ASC`,
        params
    );

    const targetsRow = await getOne(
        'SELECT COUNT(*) AS total_targets, COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active_targets FROM youtube_video_metadata_targets'
    );

    const latestRun = await getOne(
        `SELECT id, channel_id, channel_title, inspected_count, needs_fix_count, created_at
         FROM youtube_channel_audit_runs
         ORDER BY id DESC
         LIMIT 1`
    );

    const dayMap = new Map();
    const ensureDay = (dayValue) => {
        const day = normalizeDayValue(dayValue);
        if (!dayMap.has(day)) {
            dayMap.set(day, {
                day,
                auditRuns: 0,
                inspected: 0,
                needsFix: 0,
                updated: 0,
                skipped: 0,
                error: 0,
                seoRuns: 0,
                seoCompleted: 0,
                seoCompletedWithErrors: 0,
                snapshots: 0
            });
        }
        return dayMap.get(day);
    };

    for (const row of auditRows) {
        const d = ensureDay(row.day);
        d.auditRuns = Number(row.audit_runs || 0);
        d.inspected = Number(row.inspected_total || 0);
        d.needsFix = Number(row.needs_fix_total || 0);
    }
    for (const row of updateRows) {
        const d = ensureDay(row.day);
        d.updated = Number(row.updated_count || 0);
        d.skipped = Number(row.skipped_count || 0);
        d.error = Number(row.error_count || 0);
    }
    for (const row of seoRows) {
        const d = ensureDay(row.day);
        d.seoRuns = Number(row.seo_runs || 0);
        d.seoCompleted = Number(row.seo_completed || 0);
        d.seoCompletedWithErrors = Number(row.seo_completed_with_errors || 0);
    }
    for (const row of snapshotRows) {
        const d = ensureDay(row.day);
        d.snapshots = Number(row.snapshots || 0);
    }

    const days = [...dayMap.values()].sort((a, b) => a.day.localeCompare(b.day));

    const totals = days.reduce(
        (acc, day) => {
            acc.auditRuns += day.auditRuns;
            acc.videosInspected += day.inspected;
            acc.videosNeedsFix += day.needsFix;
            acc.updated += day.updated;
            acc.skipped += day.skipped;
            acc.error += day.error;
            acc.seoRuns += day.seoRuns;
            acc.seoCompleted += day.seoCompleted;
            acc.seoCompletedWithErrors += day.seoCompletedWithErrors;
            acc.snapshots += day.snapshots;
            return acc;
        },
        {
            auditRuns: 0,
            videosInspected: 0,
            videosNeedsFix: 0,
            updated: 0,
            skipped: 0,
            error: 0,
            seoRuns: 0,
            seoCompleted: 0,
            seoCompletedWithErrors: 0,
            snapshots: 0,
            totalTargets: Number(targetsRow?.total_targets || 0),
            activeTargets: Number(targetsRow?.active_targets || 0)
        }
    );

    return {
        generatedAt: new Date().toISOString(),
        range: {
            from: from || null,
            to: to || null
        },
        latestRun: latestRun
            ? {
                id: latestRun.id,
                channelId: latestRun.channel_id,
                channelTitle: latestRun.channel_title,
                inspectedCount: Number(latestRun.inspected_count || 0),
                needsFixCount: Number(latestRun.needs_fix_count || 0),
                createdAt: latestRun.created_at
            }
            : null,
        totals,
        days
    };
}

async function generateAndStoreYoutubeOpsDailyReport({
    requestedBy = 'dashboard',
    reportDate = '',
    fromDate = '',
    toDate = ''
} = {}) {
    const summary = await buildYoutubeOpsDailyReport({ fromDate, toDate });
    const normalizedReportDate = normalizeDateInput(reportDate) || new Date().toISOString().slice(0, 10);
    const markdown = renderDailyReportMarkdown({ ...summary, reportDate: normalizedReportDate });

    await run(
        `INSERT INTO youtube_ops_daily_reports
         (report_date, generated_by_user, summary_json, report_markdown)
         VALUES (?, ?, CAST(? AS JSON), ?)
         ON DUPLICATE KEY UPDATE
           generated_by_user = VALUES(generated_by_user),
           summary_json = CAST(? AS JSON),
           report_markdown = VALUES(report_markdown),
           updated_at = NOW()`,
        [
            normalizedReportDate,
            String(requestedBy || 'dashboard'),
            JSON.stringify(summary),
            markdown,
            JSON.stringify(summary)
        ]
    );

    return {
        reportDate: normalizedReportDate,
        summary,
        markdown
    };
}

function parseEmailList(raw) {
    return String(raw || '')
        .split(/[;,\n]+/)
        .map((x) => x.trim())
        .filter(Boolean);
}

function resolveReportEmailTransportConfig() {
    const host = getRequiredEnv('SMTP_HOST');
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isFinite(port) || port <= 0) {
        throw new Error(`invalid_smtp_port:${process.env.SMTP_PORT || ''}`);
    }

    const user = getRequiredEnv('SMTP_USER');
    const pass = getRequiredEnv('SMTP_PASS');
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' || port === 465;

    return {
        host,
        port,
        secure,
        auth: { user, pass }
    };
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function buildYoutubeOpsReportEmailHtml({ reportDate, summary }) {
    const rows = (summary?.days || [])
        .map((day) => `
            <tr>
                <td>${escapeHtml(day.day)}</td>
                <td>${Number(day.auditRuns || 0)}</td>
                <td>${Number(day.inspected || 0)}</td>
                <td>${Number(day.needsFix || 0)}</td>
                <td>${Number(day.updated || 0)}</td>
                <td>${Number(day.skipped || 0)}</td>
                <td>${Number(day.error || 0)}</td>
                <td>${Number(day.seoRuns || 0)}</td>
            </tr>
        `)
        .join('');

    const totals = summary?.totals || {};
    const latest = summary?.latestRun || null;

    return `
        <h2>YouTube Ops Daily Report (${escapeHtml(reportDate)})</h2>
        <p><strong>Generated:</strong> ${escapeHtml(summary?.generatedAt || '')}</p>
        <p><strong>Range:</strong> ${escapeHtml(summary?.range?.from || 'start')} to ${escapeHtml(summary?.range?.to || reportDate)}</p>

        <h3>Totals</h3>
        <ul>
            <li>Audit runs: ${Number(totals.auditRuns || 0)}</li>
            <li>Videos inspected: ${Number(totals.videosInspected || 0)}</li>
            <li>Videos with issues: ${Number(totals.videosNeedsFix || 0)}</li>
            <li>Metadata updates: updated=${Number(totals.updated || 0)}, skipped=${Number(totals.skipped || 0)}, error=${Number(totals.error || 0)}</li>
            <li>SEO runs: ${Number(totals.seoRuns || 0)} (completed=${Number(totals.seoCompleted || 0)}, completed_with_errors=${Number(totals.seoCompletedWithErrors || 0)})</li>
            <li>Active DB targets: ${Number(totals.activeTargets || 0)}</li>
        </ul>

        <h3>Daily breakdown</h3>
        <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
            <thead>
                <tr>
                    <th>Day</th>
                    <th>Audit runs</th>
                    <th>Inspected</th>
                    <th>Needs fix</th>
                    <th>Updated</th>
                    <th>Skipped</th>
                    <th>Error</th>
                    <th>SEO runs</th>
                </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="8">No rows</td></tr>'}</tbody>
        </table>

        ${latest
            ? `<h3>Latest run</h3><p>Run ${latest.id} | Channel ${escapeHtml(latest.channelTitle || latest.channelId)} | inspected=${Number(latest.inspectedCount || 0)} | needs_fix=${Number(latest.needsFixCount || 0)}</p>`
            : '<p>No audit runs found.</p>'}

        <p>Adjunto: PDF del reporte diario.</p>
    `;
}

async function buildYoutubeOpsReportPdfBuffer({ reportDate, summary }) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 48 });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const totals = summary?.totals || {};
        const latest = summary?.latestRun || null;

        doc.fontSize(18).text('YouTube Ops Daily Report', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11).text(`Report date: ${reportDate}`);
        doc.text(`Generated at: ${summary?.generatedAt || ''}`);
        doc.text(`Range: ${summary?.range?.from || 'start'} to ${summary?.range?.to || reportDate}`);

        doc.moveDown();
        doc.fontSize(13).text('Totals');
        doc.fontSize(11);
        doc.text(`- Audit runs: ${Number(totals.auditRuns || 0)}`);
        doc.text(`- Videos inspected: ${Number(totals.videosInspected || 0)}`);
        doc.text(`- Videos with issues: ${Number(totals.videosNeedsFix || 0)}`);
        doc.text(`- Metadata updates: updated=${Number(totals.updated || 0)}, skipped=${Number(totals.skipped || 0)}, error=${Number(totals.error || 0)}`);
        doc.text(`- SEO runs: ${Number(totals.seoRuns || 0)} (completed=${Number(totals.seoCompleted || 0)}, completed_with_errors=${Number(totals.seoCompletedWithErrors || 0)})`);
        doc.text(`- Active DB targets: ${Number(totals.activeTargets || 0)}`);

        doc.moveDown();
        doc.fontSize(13).text('Daily Breakdown');
        doc.fontSize(10);
        const days = summary?.days || [];
        if (!days.length) {
            doc.text('No data rows.');
        } else {
            for (const day of days) {
                const line = `${day.day} | audits=${Number(day.auditRuns || 0)} | inspected=${Number(day.inspected || 0)} | needs_fix=${Number(day.needsFix || 0)} | updates=${Number(day.updated || 0)}/${Number(day.skipped || 0)}/${Number(day.error || 0)} | seo_runs=${Number(day.seoRuns || 0)} | snapshots=${Number(day.snapshots || 0)}`;
                doc.text(line);
            }
        }

        if (latest) {
            doc.moveDown();
            doc.fontSize(13).text('Latest Audit Run');
            doc.fontSize(11).text(`Run ${latest.id} | channel=${latest.channelTitle || latest.channelId}`);
            doc.text(`inspected=${Number(latest.inspectedCount || 0)} | needs_fix=${Number(latest.needsFixCount || 0)}`);
            doc.text(`created_at=${latest.createdAt || ''}`);
        }

        doc.end();
    });
}

function resolveEmailTransportMode() {
    const mode = normalizeLower(process.env.YT_REPORT_EMAIL_TRANSPORT || 'smtp');
    if (mode === 'graph') return 'graph';
    return 'smtp';
}

function resolveGraphEmailConfig() {
    const tenantId = getRequiredEnv('MS_GRAPH_TENANT_ID');
    const clientId = getRequiredEnv('MS_GRAPH_CLIENT_ID');
    const clientSecret = getRequiredEnv('MS_GRAPH_CLIENT_SECRET');
    const senderUser = normalizeSpaces(process.env.MS_GRAPH_SENDER_USER || process.env.SMTP_USER || '');
    if (!senderUser) {
        throw new Error('missing_graph_sender_user');
    }

    return {
        tenantId,
        clientId,
        clientSecret,
        senderUser
    };
}

async function getMicrosoftGraphAccessToken(config) {
    const tokenUrl = `https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`;
    const form = new URLSearchParams();
    form.set('client_id', config.clientId);
    form.set('client_secret', config.clientSecret);
    form.set('scope', 'https://graph.microsoft.com/.default');
    form.set('grant_type', 'client_credentials');

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString()
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.access_token) {
        const msg = payload?.error_description || payload?.error || `http_${response.status}`;
        throw new Error(`graph_token_error:${msg}`);
    }

    return String(payload.access_token);
}

async function sendYoutubeOpsReportViaGraph({
    recipientsTo,
    recipientsCc,
    recipientsBcc,
    subject,
    html,
    pdfBuffer,
    reportDate
}) {
    const config = resolveGraphEmailConfig();
    const accessToken = await getMicrosoftGraphAccessToken(config);

    const toRecipients = recipientsTo.map((address) => ({ emailAddress: { address } }));
    const ccRecipients = recipientsCc.map((address) => ({ emailAddress: { address } }));
    const bccRecipients = recipientsBcc.map((address) => ({ emailAddress: { address } }));

    const payload = {
        message: {
            subject,
            body: {
                contentType: 'HTML',
                content: html
            },
            toRecipients,
            ccRecipients,
            bccRecipients,
            attachments: [
                {
                    '@odata.type': '#microsoft.graph.fileAttachment',
                    name: `youtube-ops-report-${reportDate}.pdf`,
                    contentType: 'application/pdf',
                    contentBytes: pdfBuffer.toString('base64')
                }
            ]
        },
        saveToSentItems: true
    };

    const response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(config.senderUser)}/sendMail`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const bodyText = await response.text().catch(() => '');
        throw new Error(`graph_send_error:${response.status}:${String(bodyText).slice(0, 500)}`);
    }

    const requestId = response.headers.get('request-id') || response.headers.get('x-ms-request-id') || '';
    return {
        mode: 'graph',
        sender: config.senderUser,
        messageId: requestId ? `graph_request_id:${requestId}` : 'graph_sent'
    };
}

async function sendYoutubeOpsDailyReportEmail({
    requestedBy = 'dashboard',
    reportDate = '',
    fromDate = '',
    toDate = '',
    to = '',
    cc = '',
    bcc = '',
    subject = ''
} = {}) {
    await ensureYoutubeMetadataTables();

    const recipientsTo = parseEmailList(to || process.env.YT_DAILY_REPORT_TO || '');
    const recipientsCc = parseEmailList(cc);
    const recipientsBcc = parseEmailList(bcc);

    const report = await generateAndStoreYoutubeOpsDailyReport({
        requestedBy,
        reportDate,
        fromDate,
        toDate
    });

    const reportRow = await getOne(
        'SELECT id FROM youtube_ops_daily_reports WHERE report_date = ? LIMIT 1',
        [report.reportDate]
    );

    const mailSubject = normalizeSpaces(subject) || `YouTube Ops Daily Report - ${report.reportDate}`;
    let status = 'error';
    let messageText = 'send_not_attempted';
    let messageId = '';
    let transportConfig = null;
    let senderUsed = '';
    const transportMode = resolveEmailTransportMode();

    try {
        if (!recipientsTo.length) {
            throw new Error('missing_report_email_to');
        }

        const html = buildYoutubeOpsReportEmailHtml({
            reportDate: report.reportDate,
            summary: report.summary
        });
        const pdfBuffer = await buildYoutubeOpsReportPdfBuffer({
            reportDate: report.reportDate,
            summary: report.summary
        });

        if (transportMode === 'graph') {
            const sent = await sendYoutubeOpsReportViaGraph({
                recipientsTo,
                recipientsCc,
                recipientsBcc,
                subject: mailSubject,
                html,
                pdfBuffer,
                reportDate: report.reportDate
            });
            senderUsed = sent.sender || '';
            messageId = String(sent.messageId || 'graph_sent');
            status = 'sent';
            messageText = messageId;
        } else {
            transportConfig = resolveReportEmailTransportConfig();
            const transporter = nodemailer.createTransport(transportConfig);
            const sender = normalizeSpaces(
                process.env.YT_REPORT_EMAIL_FROM || process.env.SMTP_FROM || `El Inmortal 2 Dashboard <${transportConfig.auth.user}>`
            );
            senderUsed = sender;

            const info = await transporter.sendMail({
                from: sender,
                to: recipientsTo.join(', '),
                cc: recipientsCc.length ? recipientsCc.join(', ') : undefined,
                bcc: recipientsBcc.length ? recipientsBcc.join(', ') : undefined,
                subject: mailSubject,
                html,
                attachments: [
                    {
                        filename: `youtube-ops-report-${report.reportDate}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            });

            messageId = String(info?.messageId || '');
            status = 'sent';
            messageText = messageId ? `message_id:${messageId}` : 'sent';
        }
    } catch (error) {
        status = 'error';
        messageText = String(error.message || 'send_failed').slice(0, 1000);
        throw error;
    } finally {
        const payload = {
            reportDate: report.reportDate,
            recipients: {
                to: recipientsTo,
                cc: recipientsCc,
                bcc: recipientsBcc
            },
            subject: mailSubject,
            messageId,
            transportMode,
            senderUsed: senderUsed || null,
            smtpHost: transportConfig?.host || null,
            smtpPort: transportConfig?.port || null,
            totals: report.summary?.totals || {}
        };

        try {
            await run(
                `INSERT INTO youtube_ops_email_logs
                 (report_date, report_id, sent_by_user, recipients_to, recipients_cc, recipients_bcc,
                  subject_text, status, message_text, payload_json)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON))`,
                [
                    report.reportDate,
                    reportRow?.id || null,
                    String(requestedBy || 'dashboard'),
                    recipientsTo.join(', '),
                    recipientsCc.join(', '),
                    recipientsBcc.join(', '),
                    mailSubject,
                    status,
                    messageText,
                    JSON.stringify(payload)
                ]
            );
        } catch (_) {
            // swallow log failures to avoid masking primary send result
        }
    }

    return {
        reportDate: report.reportDate,
        recipients: {
            to: recipientsTo,
            cc: recipientsCc,
            bcc: recipientsBcc
        },
        subject: mailSubject,
        transportMode,
        senderUsed,
        messageId,
        totals: report.summary?.totals || {}
    };
}

async function getRemoteVideoSnippetStatus(youtube, videoId) {
    const resp = await youtube.videos.list({
        part: ['snippet', 'status'],
        id: videoId,
        maxResults: 1
    });
    const item = resp?.data?.items?.[0];
    if (!item) return null;
    return {
        snippet: item.snippet || {},
        status: item.status || {}
    };
}

function resolveUpdatePlan(item, mode) {
    const hasTarget = !!(item.targetTitle && item.targetDescription);

    if (mode === 'target_only') {
        if (!hasTarget) return { skip: true, reason: 'no_target' };
        return {
            skip: false,
            source: 'target',
            title: item.targetTitle,
            description: item.targetDescription,
            categoryId: item.targetCategoryId || DEFAULT_CATEGORY_ID,
            tags: item.targetTags
        };
    }

    if (hasTarget) {
        return {
            skip: false,
            source: 'target',
            title: item.targetTitle,
            description: item.targetDescription,
            categoryId: item.targetCategoryId || DEFAULT_CATEGORY_ID,
            tags: item.targetTags
        };
    }

    return {
        skip: false,
        source: 'heuristic',
        title: item.recommendedTitle || item.titleCurrent,
        description: item.recommendedDescription || item.descriptionCurrent,
        categoryId: item.recommendedCategoryId || DEFAULT_CATEGORY_ID,
        tags: item.recommendedTags
    };
}

function isShortFormTitle(title) {
    const text = normalizeLower(title);
    if (!text) return false;
    return text.includes('#shorts') || /\bshorts?\b/.test(text);
}

function isLikelyMainVideo(item) {
    const title = item?.titleCurrent || item?.recommendedTitle || '';
    return !isShortFormTitle(title);
}

function buildSafeMainHeuristicPayload(item, clamped, planCategoryId) {
    const safeTags = (item.tagsCurrent && item.tagsCurrent.length)
        ? normalizeTags(item.tagsCurrent)
        : clamped.tags;
    const safeClamped = clampMetadata(
        String(item.titleCurrent ?? clamped.title),
        String(item.descriptionCurrent ?? clamped.description),
        safeTags
    );

    return {
        title: safeClamped.title,
        description: safeClamped.description,
        categoryId: String(item.categoryCurrent || planCategoryId || DEFAULT_CATEGORY_ID),
        tags: safeClamped.tags
    };
}

function hasMetadataChange(item, payload) {
    const currentCategoryId = String(item.categoryCurrent || DEFAULT_CATEGORY_ID);
    const nextCategoryId = String(payload.categoryId || DEFAULT_CATEGORY_ID);

    if (normalizeLower(item.titleCurrent || '') !== normalizeLower(payload.title || '')) return true;
    if (normalizeLower(item.descriptionCurrent || '') !== normalizeLower(payload.description || '')) return true;
    if (currentCategoryId !== nextCategoryId) return true;
    if (!tagsAreEqual(item.tagsCurrent || [], payload.tags || [])) return true;
    return false;
}

function isQuotaExceededError(error) {
    const text = normalizeLower(error?.message || '');
    if (!text) return false;
    return text.includes('quota') || text.includes('daily limit') || text.includes('quotaexceeded');
}

async function applyYoutubeAuditUpdates({
    runId,
    requestedBy = 'dashboard',
    mode = 'target_and_heuristic',
    onlyNeedsFix = true,
    limit = 200,
    selectedVideoIds = [],
    protectMainHeuristic = true
} = {}) {
    await ensureYoutubeMetadataTables();

    const runRow = await getOne('SELECT * FROM youtube_channel_audit_runs WHERE id = ?', [runId]);
    if (!runRow) {
        throw new Error(`Audit run not found: ${runId}`);
    }

    let sql = `SELECT * FROM youtube_channel_audit_items WHERE run_id = ?`;
    const params = [runId];

    if (onlyNeedsFix) {
        sql += ' AND needs_fix = 1';
    }

    const filteredIds = Array.isArray(selectedVideoIds)
        ? selectedVideoIds.map((x) => String(x || '').trim()).filter(Boolean)
        : [];
    if (filteredIds.length) {
        sql += ` AND video_id IN (${filteredIds.map(() => '?').join(',')})`;
        params.push(...filteredIds);
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit || 200)));
    sql += ` ORDER BY id ASC LIMIT ${safeLimit}`;

    const rows = await getAll(sql, params);
    const items = rows.map(parseAuditItemRow);

    const youtube = await getYoutubeClient();

    let updated = 0;
    let skipped = 0;
    let failed = 0;
    let protectedMain = 0;
    let quotaExceeded = false;

    for (const item of items) {
        if (quotaExceeded) {
            skipped += 1;
            const reason = 'quota_exceeded_abort';
            await run(
                `UPDATE youtube_channel_audit_items
                 SET update_status = 'skipped', update_message = ?, updated_at = NOW()
                 WHERE id = ?`,
                [reason, item.id]
            );
            await run(
                `INSERT INTO youtube_channel_update_logs
                 (run_id, channel_id, video_id, action_name, status, message, payload_json)
                 VALUES (?, ?, ?, 'metadata_update', 'skipped', ?, CAST(? AS JSON))`,
                [
                    runId,
                    runRow.channel_id,
                    item.videoId,
                    reason,
                    JSON.stringify({ requestedBy, mode, protectMainHeuristic })
                ]
            );
            continue;
        }

        const plan = resolveUpdatePlan(item, mode);
        if (plan.skip) {
            skipped += 1;
            await run(
                `UPDATE youtube_channel_audit_items
                 SET update_status = 'skipped', update_message = ?, updated_at = NOW()
                 WHERE id = ?`,
                [plan.reason || 'skipped', item.id]
            );
            await run(
                `INSERT INTO youtube_channel_update_logs
                 (run_id, channel_id, video_id, action_name, status, message, payload_json)
                 VALUES (?, ?, ?, 'metadata_update', 'skipped', ?, CAST(? AS JSON))`,
                [runId, runRow.channel_id, item.videoId, plan.reason || 'skipped', JSON.stringify({ requestedBy, mode })]
            );
            continue;
        }

        const clamped = clampMetadata(plan.title, plan.description, plan.tags);
        const basePayload = {
            title: clamped.title,
            description: clamped.description,
            categoryId: String(plan.categoryId || DEFAULT_CATEGORY_ID),
            tags: clamped.tags
        };

        const applyMainProtection = protectMainHeuristic && plan.source === 'heuristic' && isLikelyMainVideo(item);
        if (applyMainProtection) {
            protectedMain += 1;
        }

        const payload = applyMainProtection
            ? buildSafeMainHeuristicPayload(item, clamped, plan.categoryId)
            : basePayload;

        const sourceLabel = applyMainProtection
            ? `source:${plan.source}:main_protected`
            : `source:${plan.source}`;

        if (!hasMetadataChange(item, payload)) {
            skipped += 1;
            const reason = applyMainProtection ? 'protected_main_no_safe_change' : 'no_change';
            await run(
                `UPDATE youtube_channel_audit_items
                 SET update_status = 'skipped', update_message = ?, updated_at = NOW()
                 WHERE id = ?`,
                [reason, item.id]
            );
            await run(
                `INSERT INTO youtube_channel_update_logs
                 (run_id, channel_id, video_id, action_name, status, message, payload_json)
                 VALUES (?, ?, ?, 'metadata_update', 'skipped', ?, CAST(? AS JSON))`,
                [
                    runId,
                    runRow.channel_id,
                    item.videoId,
                    reason,
                    JSON.stringify({
                        requestedBy,
                        mode,
                        protectMainHeuristic,
                        sourceLabel,
                        title: payload.title,
                        descriptionLength: payload.description.length,
                        tagsCount: payload.tags.length,
                        categoryId: payload.categoryId
                    })
                ]
            );
            continue;
        }

        try {
            const remote = await getRemoteVideoSnippetStatus(youtube, item.videoId);
            if (!remote) {
                throw new Error('video_not_found');
            }

            const snippet = {
                ...remote.snippet,
                title: payload.title,
                description: payload.description,
                categoryId: String(payload.categoryId || DEFAULT_CATEGORY_ID),
                tags: payload.tags
            };

            const status = {
                ...remote.status
            };

            await youtube.videos.update({
                part: ['snippet', 'status'],
                requestBody: {
                    id: item.videoId,
                    snippet,
                    status
                }
            });

            updated += 1;
            await run(
                `UPDATE youtube_channel_audit_items
                 SET update_status = 'updated', update_message = ?, updated_at = NOW()
                 WHERE id = ?`,
                [sourceLabel, item.id]
            );

            await run(
                `INSERT INTO youtube_channel_update_logs
                 (run_id, channel_id, video_id, action_name, status, message, payload_json)
                 VALUES (?, ?, ?, 'metadata_update', 'updated', ?, CAST(? AS JSON))`,
                [
                    runId,
                    runRow.channel_id,
                    item.videoId,
                    sourceLabel,
                    JSON.stringify({
                        requestedBy,
                        mode,
                        protectMainHeuristic,
                        title: payload.title,
                        descriptionLength: payload.description.length,
                        tagsCount: payload.tags.length,
                        categoryId: String(payload.categoryId || DEFAULT_CATEGORY_ID)
                    })
                ]
            );
        } catch (error) {
            failed += 1;
            const errorMessage = String(error.message || 'update_failed').slice(0, 1000);
            await run(
                `UPDATE youtube_channel_audit_items
                 SET update_status = 'error', update_message = ?, updated_at = NOW()
                 WHERE id = ?`,
                [errorMessage, item.id]
            );

            await run(
                `INSERT INTO youtube_channel_update_logs
                 (run_id, channel_id, video_id, action_name, status, message, payload_json)
                 VALUES (?, ?, ?, 'metadata_update', 'error', ?, CAST(? AS JSON))`,
                [
                    runId,
                    runRow.channel_id,
                    item.videoId,
                    errorMessage,
                    JSON.stringify({ requestedBy, mode, protectMainHeuristic, sourceLabel })
                ]
            );

            if (isQuotaExceededError(error)) {
                quotaExceeded = true;
            }
        }
    }

    return {
        runId,
        processed: items.length,
        updated,
        skipped,
        failed,
        protectedMain,
        quotaExceeded
    };
}

module.exports = {
    ensureYoutubeMetadataTables,
    inspectYoutubeChannelAndStore,
    getYoutubeAuditDashboardData,
    applyYoutubeAuditUpdates,
    optimizeTopTrafficVideosAndStoreTargets,
    optimizeTopTrafficAndApplyUpdates,
    buildYoutubeOpsDailyReport,
    generateAndStoreYoutubeOpsDailyReport,
    sendYoutubeOpsDailyReportEmail
};
