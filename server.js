const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const env = require('./vars/env.json');
const credentials = require('./vars/credentials.json');
const {spotifyFetch} = require("./src/generateSpotifyPlaylist");
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

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

admin.initializeApp({credential: admin.credential.cert(credentials.GCP_SERVICE_ACCOUNT)});
const db = getFirestore(app, 'sfbangers');

const SESSION_COOKIE = 'sfb_session';
const PKCE_COOKIE = 'sfb_pkce';
const IS_PROD = env.NODE_ENV === 'prod';
const MOBILE_AUTH_DEEP_LINK = 'gigly://auth-callback';

app.get('/similar-artists', async (req, res) => {
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
            console.error('similar-artists (group) error:', err);
            return res.status(500).json({ error: err?.message || String(err) });
        }
    }

    if (!req.query || typeof req.query.artist !== 'string' || !req.query.artist.trim()) {
        return res.status(400).send('Missing artist query parameter');
    }

    try {
        const results = await findSimilarArtists(db, credentials.ANTHROPIC_API_KEY, req.query.artist.trim(), { mode });
        return res.status(200).json(results);
    } catch (err) {
        console.error('similar-artists error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
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

        return res.redirect(`${env.FRONTEND_URL}/generate?connected=1`);
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
        console.error('top-artists error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
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
        console.error('artist-images error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
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
        console.error('artist-preview error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

app.get('/scrape-foopee-list', async (req, res) => {
    if (
        !req.query ||
        typeof req.query.key !== "string" ||
        req.query.key !== "ohBE0DPCNAlRv3lU"
    ) {
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