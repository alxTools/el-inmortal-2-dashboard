let fetchFn = globalThis.fetch;

if (!fetchFn) {
    try {
        const nodeFetch = require('node-fetch');
        fetchFn = nodeFetch.default || nodeFetch;
    } catch (error) {
        console.error('[Spotify] No se pudo cargar node-fetch:', error.message);
    }
}

let cachedToken = null;
let cachedTokenExpiresAt = 0;

function isSpotifyConfigured() {
    return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function normalizeSpotifyArtistFilter(rawArtist) {
    return String(rawArtist || process.env.SPOTIFY_ARTIST_FILTER || 'Galante el Emperador').trim();
}

async function getSpotifyAccessToken() {
    if (!isSpotifyConfigured()) {
        throw new Error('spotify_not_configured');
    }

    const now = Date.now();
    if (cachedToken && cachedTokenExpiresAt > now + 15000) {
        return cachedToken;
    }

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetchFn('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${auth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`spotify_auth_failed:${errorText}`);
    }

    const tokenData = await response.json();
    cachedToken = tokenData.access_token;
    cachedTokenExpiresAt = now + (Number(tokenData.expires_in || 3600) * 1000);
    return cachedToken;
}

function mapSpotifyTrack(track) {
    const albumImages = Array.isArray(track?.album?.images) ? track.album.images : [];
    const cover = albumImages[0]?.url || albumImages[1]?.url || albumImages[2]?.url || '';
    const artistNames = Array.isArray(track?.artists)
        ? track.artists.map((artist) => artist?.name).filter(Boolean)
        : [];

    return {
        id: track?.id || '',
        title: track?.name || 'Sin titulo',
        artistNames,
        artistsLabel: artistNames.join(', '),
        albumName: track?.album?.name || '',
        cover,
        durationMs: Number(track?.duration_ms || 0),
        previewUrl: track?.preview_url || '',
        spotifyUrl: track?.external_urls?.spotify || ''
    };
}

async function searchSpotifyTracks({ query, limit = 12, artistFilter }) {
    try {
        const cleanQuery = String(query || '').trim();
        if (cleanQuery.length < 2) {
            return { success: false, error: 'query_too_short', tracks: [] };
        }

        const token = await getSpotifyAccessToken();
        const normalizedArtist = normalizeSpotifyArtistFilter(artistFilter);
        const market = String(process.env.SPOTIFY_MARKET || 'US').trim().toUpperCase() || 'US';
        const normalizedLimit = Math.min(Math.max(Number(limit) || 12, 1), 25);

        const searchQuery = normalizedArtist
            ? `track:${cleanQuery} artist:${normalizedArtist}`
            : cleanQuery;

        const params = new URLSearchParams({
            q: searchQuery,
            type: 'track',
            limit: String(normalizedLimit),
            market
        });

        const response = await fetchFn(`https://api.spotify.com/v1/search?${params.toString()}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`spotify_search_failed:${errorText}`);
        }

        const payload = await response.json();
        const rawTracks = Array.isArray(payload?.tracks?.items) ? payload.tracks.items : [];

        const tracks = rawTracks
            .map(mapSpotifyTrack)
            .filter((track) => track.id && track.title);

        return {
            success: true,
            tracks,
            artistFilter: normalizedArtist,
            market
        };
    } catch (error) {
        console.error('[Spotify] Error en searchSpotifyTracks:', error.message);
        return { success: false, error: error.message, tracks: [] };
    }
}

module.exports = {
    isSpotifyConfigured,
    normalizeSpotifyArtistFilter,
    searchSpotifyTracks
};
