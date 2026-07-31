const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const env = require('./vars/env.json');
const credentials = require('./vars/credentials.json');
const {spotifyFetch, generatePlaylistTop5PerArtist} = require("./src/generateSpotifyPlaylist");
const {scrapeFoopeeListToFirestore} = require("./src/scrapeFoopeeList");
const {findSimilarArtists, findSimilarArtistsForGroup} = require("./src/findSimilarArtists");
const {parseCookies, getSessionId} = require("./src/cookies");
const {
    generatePkcePair,
    buildAuthorizeUrl,
    getSpotifyAppCredentials,
    exchangeCodeForTokens,
    createUserSession,
    getValidAccessTokenForSession,
    getSpotifyAppAccessToken,
} = require("./src/spotifyUserAuth");

const app = express();
app.disable('etag');
app.use(express.static(__dirname + '/build', { etag: false }));

// Only the site's own frontend gets credentialed cross-origin access — requests
// with no Origin header (mobile app fetches, curl, server-to-server) are still
// allowed through, since they can't carry cookies to steal in the first place.
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || origin === env.FRONTEND_URL) return callback(null, true);
        return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

const SESSION_COOKIE = 'sfb_session';
const PKCE_COOKIE = 'sfb_pkce';
const IS_PROD = env.NODE_ENV === 'prod';
const MOBILE_AUTH_DEEP_LINK = 'gigly://auth-callback';

// Firestore-backed so the limit is shared across every App Engine instance —
// an in-memory counter would only cap requests hitting that one instance,
// not the client overall, once traffic is spread across multiple instances.
async function checkRateLimit(ip, { limit = 30, windowMs = 10 * 60 * 1000 } = {}) {
    const key = (ip || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const ref = db.collection('rateLimits').doc(key);
    const now = Date.now();

    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() : null;

        if (!data || now - data.windowStart > windowMs) {
            tx.set(ref, { windowStart: now, count: 1 });
            return true;
        }
        if (data.count >= limit) return false;

        tx.update(ref, { count: admin.firestore.FieldValue.increment(1) });
        return true;
    });
}

function clientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) return forwarded.split(',')[0].trim();
    return req.socket.remoteAddress;
}

// Logs the real error server-side but never echoes internal details (file
// paths, Firestore/Anthropic error text, etc.) back to whoever called the API.
function sendServerError(res, label, err) {
    console.error(`${label}:`, err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
}

app.get('/similar-artists', async (req, res) => {
    const allowed = await checkRateLimit(clientIp(req));
    if (!allowed) return res.status(429).json({ error: 'Too many requests — please try again in a bit.' });

    const mode = ['blowing-up', 'hidden-gems'].includes(req.query.mode) ? req.query.mode : undefined;
    if (typeof req.query.artists === 'string' && req.query.artists.trim()) {
        const artistNames = req.query.artists.split(',').map((n) => n.trim()).filter(Boolean).slice(0, 10);
        if (artistNames.length === 0) {
            return res.status(400).send('Missing artists query parameter');
        }
        try {
            const results = await findSimilarArtistsForGroup(db, credentials.ANTHROPIC_API_KEY, artistNames, { mode });
            return res.status(200).json(results);
        } catch (err) {
            return sendServerError(res, 'similar-artists (group) error', err);
        }
    }

    if (!req.query || typeof req.query.artist !== 'string' || !req.query.artist.trim()) {
        return res.status(400).send('Missing artist query parameter');
    }

    try {
        const results = await findSimilarArtists(db, credentials.ANTHROPIC_API_KEY, req.query.artist.trim(), { mode });
        return res.status(200).json(results);
    } catch (err) {
        return sendServerError(res, 'similar-artists error', err);
    }
});

app.get('/auth/spotify/login', async (req, res) => {
    try {
        const { clientId } = await getSpotifyAppCredentials(db);
        const { codeVerifier, codeChallenge } = generatePkcePair();
        const redirectUri = `${env.BACKEND_URL}/auth/spotify/callback`;
        const state = req.query.state === 'mobile' ? 'mobile' : undefined;

        res.cookie(PKCE_COOKIE, codeVerifier, {
            httpOnly: true,
            sameSite: 'lax',
            secure: IS_PROD,
            maxAge: 10 * 60 * 1000,
        });

        return res.redirect(buildAuthorizeUrl(clientId, redirectUri, codeChallenge, state));
    } catch (err) {
        console.error('spotify login error:', err);
        return res.status(500).send('Unable to start Spotify login');
    }
});

app.get('/auth/spotify/callback', async (req, res) => {
    try {
        const code = req.query.code;
        const codeVerifier = parseCookies(req)[PKCE_COOKIE];

        if (!code || !codeVerifier) {
            return res.status(400).send('Missing code or PKCE verifier — please try connecting again.');
        }

        const { clientId, clientSecret } = await getSpotifyAppCredentials(db);
        const redirectUri = `${env.BACKEND_URL}/auth/spotify/callback`;
        const tokens = await exchangeCodeForTokens(clientId, clientSecret, redirectUri, code, codeVerifier);

        const meRes = await fetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const me = await meRes.json().catch(() => null);

        const sessionId = await createUserSession(db, tokens, me?.id);

        res.clearCookie(PKCE_COOKIE);

        if (req.query.state === 'mobile') {
            return res.redirect(`${MOBILE_AUTH_DEEP_LINK}?session=${encodeURIComponent(sessionId)}`);
        }

        res.cookie(SESSION_COOKIE, sessionId, {
            httpOnly: true,
            sameSite: 'lax',
            secure: IS_PROD,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        return res.redirect(`${env.FRONTEND_URL}/spotify-prewrapped?connected=1`);
    } catch (err) {
        console.error('spotify callback error:', err);
        return res.status(500).send('Spotify login failed — please try again.');
    }
});

app.get('/auth/spotify/status', async (req, res) => {
    try {
        const sessionId = getSessionId(req, SESSION_COOKIE);
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        return res.status(200).json({ connected: !!accessToken });
    } catch (err) {
        return res.status(200).json({ connected: false });
    }
});

app.get('/generate/top-artists', async (req, res) => {
    try {
        const sessionId = getSessionId(req, SESSION_COOKIE);
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        if (!accessToken) return res.status(401).json({ error: 'Not connected to Spotify' });

        const timeRanges = ['short_term', 'medium_term', 'long_term'];
        const responses = await Promise.all(
            timeRanges.map((timeRange) =>
                spotifyFetch(
                    `https://api.spotify.com/v1/me/top/artists?time_range=${timeRange}&limit=50`,
                    accessToken,
                    { label: `top-artists:${timeRange}`, debug: false }
                )
            )
        );

        const byId = new Map();
        for (const r of responses) {
            for (const a of r?.items || []) {
                if (!byId.has(a.id)) {
                    byId.set(a.id, { id: a.id, name: a.name, images: a.images || [], genres: a.genres || [] });
                }
            }
        }

        const pool = [...byId.values()];
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }

        return res.status(200).json({ artists: pool });
    } catch (err) {
        return sendServerError(res, 'top-artists error', err);
    }
});

app.get('/generate/wrapped-stats', async (req, res) => {
    try {
        const sessionId = getSessionId(req, SESSION_COOKIE);
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        if (!accessToken) return res.status(401).json({ error: 'Not connected to Spotify' });

        // Spotify locked audio-features/audio-analysis/related-artists/recommendations
        // behind Extended Quota Mode in Nov 2024 — everything below is still open in
        // Development Mode as of the Feb 2026 changelog. Non-essential calls are
        // individually soft-failed so one missing scope/empty library doesn't take
        // down the whole page.
        const soft = (url, label) =>
            spotifyFetch(url, accessToken, { label, debug: false }).catch(() => null);

        // Spotify doesn't expose true calendar-year listening data via the public
        // API (that's what powers their official December Wrapped) — medium_term
        // (~last 6 months) is the closest available proxy for "this year so far".
        const [
            profileResp,
            artistsMedium,
            artistsShort,
            artistsLong,
            tracksResp,
            recentResp,
            likedResp,
            albumsResp,
            followingResp,
            playlistsResp,
            showsResp,
        ] = await Promise.all([
            soft('https://api.spotify.com/v1/me', 'wrapped:profile'),
            spotifyFetch('https://api.spotify.com/v1/me/top/artists?time_range=medium_term&limit=10', accessToken, {
                label: 'wrapped:artists:medium',
                debug: false,
            }),
            soft('https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=20', 'wrapped:artists:short'),
            soft('https://api.spotify.com/v1/me/top/artists?time_range=long_term&limit=50', 'wrapped:artists:long'),
            spotifyFetch('https://api.spotify.com/v1/me/top/tracks?time_range=medium_term&limit=10', accessToken, {
                label: 'wrapped:tracks',
                debug: false,
            }),
            soft('https://api.spotify.com/v1/me/player/recently-played?limit=50', 'wrapped:recent'),
            soft('https://api.spotify.com/v1/me/tracks?limit=1', 'wrapped:liked-count'),
            soft('https://api.spotify.com/v1/me/albums?limit=1', 'wrapped:albums-count'),
            soft('https://api.spotify.com/v1/me/following?type=artist&limit=1', 'wrapped:following-count'),
            soft('https://api.spotify.com/v1/me/playlists?limit=1', 'wrapped:playlists-count'),
            soft('https://api.spotify.com/v1/me/shows?limit=10', 'wrapped:shows'),
        ]);

        const topArtists = (artistsMedium?.items || []).map((a) => ({
            id: a.id,
            name: a.name,
            image: a.images?.[0]?.url || null,
            genres: a.genres || [],
            popularity: a.popularity ?? null,
        }));

        const topTracks = (tracksResp?.items || []).map((t) => ({
            id: t.id,
            name: t.name,
            artist: (t.artists || []).map((a) => a.name).join(', '),
            image: t.album?.images?.[0]?.url || null,
            popularity: t.popularity ?? null,
        }));

        const genreCounts = new Map();
        for (const a of topArtists) {
            for (const g of a.genres) {
                genreCounts.set(g, (genreCounts.get(g) || 0) + 1);
            }
        }
        const topGenres = [...genreCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 6)
            .map(([genre]) => genre);

        // "New in rotation" — artists showing up in your recent (short_term) top
        // list that aren't part of your long-standing (long_term) favorites yet.
        const longTermNames = new Set((artistsLong?.items || []).map((a) => a.name.toLowerCase()));
        const newArtists = (artistsShort?.items || [])
            .filter((a) => !longTermNames.has(a.name.toLowerCase()))
            .slice(0, 6)
            .map((a) => ({ id: a.id, name: a.name, image: a.images?.[0]?.url || null }));

        // "On repeat" — whichever track shows up most in your last 50 plays.
        let onRepeat = null;
        const recentItems = recentResp?.items || [];
        if (recentItems.length > 0) {
            const counts = new Map();
            for (const item of recentItems) {
                const track = item.track;
                if (!track?.id) continue;
                const entry = counts.get(track.id) || { track, count: 0 };
                entry.count += 1;
                counts.set(track.id, entry);
            }
            const top = [...counts.values()].sort((a, b) => b.count - a.count)[0];
            if (top && top.count > 1) {
                onRepeat = {
                    name: top.track.name,
                    artist: (top.track.artists || []).map((a) => a.name).join(', '),
                    image: top.track.album?.images?.[0]?.url || null,
                    count: top.count,
                };
            }
        }

        // "Mainstream meter" — average of the popularity scores (0-100, Spotify's
        // own metric) already attached to the top artists/tracks responses above.
        const popularityValues = [...topArtists, ...topTracks]
            .map((x) => x.popularity)
            .filter((p) => typeof p === 'number');
        const mainstreamScore = popularityValues.length
            ? Math.round(popularityValues.reduce((sum, p) => sum + p, 0) / popularityValues.length)
            : null;

        const podcasts = (showsResp?.items || [])
            .map((item) => item.show)
            .filter(Boolean)
            .map((s) => ({ id: s.id, name: s.name, publisher: s.publisher, image: s.images?.[0]?.url || null }));

        return res.status(200).json({
            profile: profileResp ? { name: profileResp.display_name, image: profileResp.images?.[0]?.url || null } : null,
            topArtists,
            topTracks,
            topGenres,
            newArtists,
            onRepeat,
            mainstreamScore,
            counts: {
                likedSongs: likedResp?.total ?? null,
                savedAlbums: albumsResp?.total ?? null,
                followedArtists: followingResp?.artists?.total ?? null,
                playlists: playlistsResp?.total ?? null,
            },
            podcasts,
            timeRange: 'medium_term',
        });
    } catch (err) {
        return sendServerError(res, 'wrapped-stats error', err);
    }
});

app.get('/generate/artist-images', async (req, res) => {
    const namesParam = req.query.names;
    if (typeof namesParam !== 'string' || !namesParam.trim()) {
        return res.status(400).json({ error: 'Missing names query parameter' });
    }
    const names = namesParam.split(',').map((n) => n.trim()).filter(Boolean).slice(0, 15);

    try {
        const appToken = await getSpotifyAppAccessToken(db);
        const results = await Promise.all(
            names.map(async (name) => {
                try {
                    const q = encodeURIComponent(`artist:"${name}"`);
                    const data = await spotifyFetch(
                        `https://api.spotify.com/v1/search?q=${q}&type=artist&limit=1`,
                        appToken,
                        { label: `artist-image:${name}`, debug: false }
                    );
                    const artist = data?.artists?.items?.[0];
                    return { name, image: artist?.images?.[0]?.url || null };
                } catch (e) {
                    return { name, image: null };
                }
            })
        );
        return res.status(200).json(results);
    } catch (err) {
        return sendServerError(res, 'artist-images error', err);
    }
});

app.get('/generate/artist-preview', async (req, res) => {
    const namesParam = req.query.names;
    if (typeof namesParam !== 'string' || !namesParam.trim()) {
        return res.status(400).json({ error: 'Missing names query parameter' });
    }
    const names = namesParam.split(',').map((n) => n.trim()).filter(Boolean).slice(0, 15);

    try {
        const results = await Promise.all(
            names.map(async (name) => {
                try {
                    const term = encodeURIComponent(name);
                    const itunesRes = await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=1`);
                    const data = await itunesRes.json();
                    const track = data?.results?.[0];
                    return {
                        name,
                        trackName: track?.trackName || null,
                        previewUrl: track?.previewUrl || null,
                        albumArt: track?.artworkUrl100 ? track.artworkUrl100.replace('100x100bb', '600x600bb') : null,
                    };
                } catch (e) {
                    return { name, trackName: null, previewUrl: null, albumArt: null };
                }
            })
        );
        return res.status(200).json(results);
    } catch (err) {
        return sendServerError(res, 'artist-preview error', err);
    }
});

app.post('/generate/playlist', async (req, res) => {
    const artists = req.body?.artists;
    if (!Array.isArray(artists) || artists.length === 0) {
        return res.status(400).json({ error: 'Missing artists array in request body' });
    }
    const cleanArtists = [...new Set(artists.filter((a) => typeof a === 'string' && a.trim()).map((a) => a.trim()))];
    if (cleanArtists.length === 0) {
        return res.status(400).json({ error: 'No valid artist names provided' });
    }

    try {
        const sessionId = getSessionId(req, SESSION_COOKIE);
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        if (!accessToken) return res.status(401).json({ error: 'Not connected to Spotify' });

        const title = 'My Gigly Mix';
        const description = `Made with Gigly — one track from each of ${cleanArtists.length} artist${cleanArtists.length > 1 ? 's' : ''} playing live in SF.`;

        const playlistObj = await generatePlaylistTop5PerArtist(accessToken, cleanArtists, title, description, {
            public: false,
            perArtistLimit: 1,
            debug: false,
        });

        return res.status(200).json({ playlistId: playlistObj.playlistId });
    } catch (err) {
        return sendServerError(res, 'generate playlist error', err);
    }
});

app.get('/scrape-foopee-list', async (req, res) => {
    // App Engine's own Cron Service sets this header on requests it dispatches
    // and strips it from any request that comes from outside GCP — that makes
    // it a stronger, secret-free check than a hardcoded key that lives in the
    // source (and in cron.yaml, and in git history).
    if (req.get('X-Appengine-Cron') !== 'true') {
        return res.status(401).send("Unauthorized");
    }
    const artistsColRef = db.collection('foopeeArtists');
    let snap = await artistsColRef.limit(500).get();
    while (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        snap = await artistsColRef.limit(500).get();
    }
    await scrapeFoopeeListToFirestore(db);
    return res.status(200).send(true);
});

app.get('/ping', (req, res) => {return res.status(200).send(`${env.BACKEND_URL} ${env.NODE_ENV}`)});

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, "build", "index.html"), {
        headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
        },
    });
});

app.listen(process.env.PORT || 8080, async () => {console.log('Running on port 8080');});