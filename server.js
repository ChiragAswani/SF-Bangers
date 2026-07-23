const cors = require('cors');
const path = require('path');
const express = require('express');
const admin = require('firebase-admin');
const {getFirestore} = require('firebase-admin/firestore');
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const env = require('./vars/env.json');
const credentials = require('./vars/credentials.json');
const {getFoopeeConcertRangesByDate, getArtistsForFoopeeWeek} = require("./src/foopee");
const {getSpotifyAccessTokenFromRefreshToken} = require("./src/generateSpotifyAccessToken");
const {spotifyFetch, generatePlaylistTop5PerArtist} = require("./src/generateSpotifyPlaylist");
const {scrapeFoopeeListToFirestore} = require("./src/scrapeFoopeeList");
const {findSimilarArtists} = require("./src/findSimilarArtists");
const {getTicketLinks} = require("./src/getTicketLinks");
const {parseCookies} = require("./src/cookies");
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

app.get('/generate-playlist', async (req, res) => {
    if (!req.query || !req.query.key || typeof(req.query.key) !== 'string' || req.query.key !== 'ohBE0DPCNAlRv3lU') {
        return res.status(401).send('Unauthorized');
    }
    const dateRanges = await getFoopeeConcertRangesByDate();
    const selectedDateRange = dateRanges[0];
    const artists = await getArtistsForFoopeeWeek(selectedDateRange);
    const accessToken = await getSpotifyAccessTokenFromRefreshToken(db);
    const playlistTitle = `SF Bangers / ${selectedDateRange}`;
    const playlistDescription = `Auto generated playlist by SF Bangers for concerts in SF from ${selectedDateRange} powered by Foopee`
    const playlistObj = await generatePlaylistTop5PerArtist(accessToken, artists, playlistTitle, playlistDescription);

    const snap = await db.collection("playlists").where("isActive", "==", true).limit(1).get();
    if (snap.empty) return;
    await snap.docs[0].ref.update({ isActive: false });
    await db.collection("playlists").add({ dateRange: selectedDateRange, playlistId: playlistObj.playlistId, isActive: true, });

    return res.status(200).send(playlistObj.playlistId)
});

app.get('/get-playlists', async (req, res) => {
    const snapshot = await db.collection("playlists").get();
    if (snapshot.empty) {
        console.log("No active playlists found");
        return [];
    }
    const data = snapshot.docs.map(doc => ({id: doc.id, ...doc.data(),}));
    return res.status(200).send(data)
});

app.get('/similar-artists', async (req, res) => {
    if (!req.query || typeof req.query.artist !== 'string' || !req.query.artist.trim()) {
        return res.status(400).send('Missing artist query parameter');
    }

    const mode = ['blowing-up', 'hidden-gems'].includes(req.query.mode) ? req.query.mode : undefined;

    try {
        const results = await findSimilarArtists(db, credentials.ANTHROPIC_API_KEY, req.query.artist.trim(), { mode });
        return res.status(200).json(results);
    } catch (err) {
        console.error('similar-artists error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

app.post('/ticket-links', async (req, res) => {
    const events = req.body?.events;
    if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'Missing events array in request body' });
    }

    const cleanEvents = events
        .filter((e) => e && typeof e.artist === 'string' && typeof e.venue === 'string' && typeof e.date === 'string')
        .map((e) => ({ artist: e.artist.trim(), venue: e.venue.trim(), date: e.date.trim() }))
        .filter((e) => e.artist && e.venue && e.date)
        .slice(0, 8);

    try {
        const results = await getTicketLinks(credentials.ANTHROPIC_API_KEY, cleanEvents);
        return res.status(200).json({ results });
    } catch (err) {
        console.error('ticket-links error:', err);
        return res.status(500).json({ error: err?.message || String(err) });
    }
});

app.get('/auth/spotify/login', async (req, res) => {
    try {
        const { clientId } = await getSpotifyAppCredentials(db);
        const { codeVerifier, codeChallenge } = generatePkcePair();
        const redirectUri = `${env.BACKEND_URL}/auth/spotify/callback`;

        res.cookie(PKCE_COOKIE, codeVerifier, {
            httpOnly: true,
            sameSite: 'lax',
            secure: IS_PROD,
            maxAge: 10 * 60 * 1000,
        });

        return res.redirect(buildAuthorizeUrl(clientId, redirectUri, codeChallenge));
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
        const sessionId = parseCookies(req)[SESSION_COOKIE];
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        return res.status(200).json({ connected: !!accessToken });
    } catch (err) {
        return res.status(200).json({ connected: false });
    }
});

app.get('/generate/top-artists', async (req, res) => {
    try {
        const sessionId = parseCookies(req)[SESSION_COOKIE];
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
        const sessionId = parseCookies(req)[SESSION_COOKIE];
        const accessToken = await getValidAccessTokenForSession(db, sessionId);
        if (!accessToken) return res.status(401).json({ error: 'Not connected to Spotify' });

        const title = 'My SF Bangers Mix';
        const description = `Made with SF Bangers — one track from each of ${cleanArtists.length} artist${cleanArtists.length > 1 ? 's' : ''} playing live in SF.`;

        const playlistObj = await generatePlaylistTop5PerArtist(accessToken, cleanArtists, title, description, {
            public: false,
            perArtistLimit: 1,
            debug: false,
        });

        return res.status(200).json({ playlistId: playlistObj.playlistId });
    } catch (err) {
        console.error('generate playlist error:', err);
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

app.get('/change-weekly-email-subscription', async (req, res) => {
    if (!req.query || !req.query.key || typeof(req.query.key) !== 'string' || req.query.key !== 'ohBE0DPCNAlRv3lU' || !req.query.email || typeof(req.query.email) !== 'string' || !req.query.email.includes('@') || req.query.email.length > 30) {
        return res.status(401).send('Unauthorized');
    }
    const colRef = db.collection('emails');
    const snap = await colRef.where("email", "==", req.query.email).get();
    if (!snap.empty) {
        const batch = db.batch();
        snap.docs.forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        return res.status(200).send(false);
    } else {
        await colRef.add({
            email: req.query.email,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return res.status(200).send(true);
    }
});

app.get("/send-weekly-playlist", async (req, res) => {
    const startedAt = Date.now();

    try {
        // --- auth ---
        if (
            !req.query ||
            typeof req.query.key !== "string" ||
            req.query.key !== "ohBE0DPCNAlRv3lU"
        ) {
            return res.status(401).send("Unauthorized");
        }

        // --- pull emails ---
        const snapshot = await db.collection("emails").get();
        const emails = [];
        snapshot.forEach((doc) => {
            const data = doc.data();
            if (data?.email && typeof data.email === "string") {
                const e = data.email.trim().toLowerCase();
                if (e) emails.push(e);
            }
        });

        // de-dupe
        const uniqueEmails = Array.from(new Set(emails));
        if (uniqueEmails.length === 0) {
            return res.status(200).json({ ok: true, sent: 0, message: "No emails found" });
        }

        // --- pull active playlist ---
        const snap = await db
            .collection("playlists")
            .where("isActive", "==", true)
            .limit(1)
            .get();

        if (snap.empty) {
            return res.status(404).json({ ok: false, error: "No active playlist found" });
        }

        const playlistObj = snap.docs[0].data();
        if (!playlistObj?.playlistId) {
            return res.status(500).json({ ok: false, error: "Active playlist missing playlistId" });
        }

        const playlistUrl = `https://open.spotify.com/playlist/${playlistObj.playlistId}`;
        const dateRange = playlistObj.dateRange || "this week";

        // --- mail transporter ---
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: credentials.GMAIL.EMAIL_ADDRESS,
                pass: credentials.GMAIL.APP_PASSWORD,
            },
        });

        // --- send individually (better deliverability than BCC blast) ---
        let sent = 0;
        let failed = 0;
        const failures = [];

        for (const email of uniqueEmails) {
            // If you don’t have an unsubscribe endpoint yet, you can remove these 2 lines + headers/footer link.
            const token = crypto.createHmac("sha256", process.env.UNSUB_SECRET || "CHANGE_ME").update(email).digest("hex");
            const unsubUrl = `${process.env.APP_BASE_URL || "https://YOUR_DOMAIN.com"}/unsubscribe?email=${encodeURIComponent(
                email
            )}&token=${token}`;

            const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial, sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f4;padding:20px 0;">
      <tr>
        <td align="center">
          <table width="600" cellpadding="0" cellspacing="0" border="0"
                 style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.08);">
            <tr>
              <td style="background:#111;padding:20px 30px;color:#ffffff;text-align:center;">
                <h1 style="margin:0;font-size:24px;letter-spacing:0.5px;">SF Bangers 🎶</h1>
                <p style="margin:5px 0 0;font-size:14px;opacity:0.85;">Your weekly playlist drop</p>
              </td>
            </tr>

            <tr>
              <td style="padding:30px;">
                <h2 style="margin:0 0 10px 0;font-size:20px;">New playlist for ${dateRange}</h2>
                <p style="font-size:14px;color:#555;margin:0 0 18px 0;">
                  Fresh tracks. No skips. Press play and enjoy your week.
                </p>

                <table cellpadding="0" cellspacing="0" border="0" style="margin:22px 0;">
                  <tr>
                    <td align="center">
                      <a href="${playlistUrl}"
                        style="background:#1DB954;color:#ffffff;text-decoration:none;
                               padding:14px 22px;border-radius:999px;font-weight:bold;
                               font-size:14px;display:inline-block;">
                        ▶ Listen on Spotify
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="font-size:12px;color:#999;margin:14px 0 6px 0;">
                  If the button doesn’t work, use this link:
                </p>
                <p style="font-size:12px;margin:0;">
                  <a href="${playlistUrl}" style="color:#1DB954;">${playlistUrl}</a>
                </p>
              </td>
            </tr>

            <tr>
              <td style="background:#fafafa;padding:18px 20px;text-align:center;font-size:12px;color:#999;">
                <p style="margin:0;">SF Bangers — made in San Francisco 🌉</p>
                <p style="margin:6px 0 0;">You’re receiving this because you subscribed to weekly playlists.</p>
                <p style="margin:10px 0 0;">
                  <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

            const text = `SF Bangers — New playlist for ${dateRange}

Listen on Spotify:
${playlistUrl}

Unsubscribe:
${unsubUrl}
`;

            const mailOptions = {
                from: `"SF Bangers 🎶" <${credentials.GMAIL.EMAIL_ADDRESS}>`,
                to: email,
                replyTo: credentials.GMAIL.EMAIL_ADDRESS,

                // Emojis can hurt deliverability; add back later after you warm up.
                subject: `SF Bangers: New Playlist for ${dateRange}`,

                text,
                html,

                headers: {
                    "List-Unsubscribe": `<${unsubUrl}>`,
                    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                    "X-Campaign": "sf-bangers-weekly",
                },
            };

            try {
                await transporter.sendMail(mailOptions);
                sent += 1;
            } catch (err) {
                failed += 1;
                failures.push({ email, error: err?.message || String(err) });
            }

            // throttle a bit to reduce Gmail rate-limit / spam signals
            await new Promise((r) => setTimeout(r, 250));
        }

        return res.status(200).json({
            ok: true,
            playlistId: playlistObj.playlistId,
            dateRange,
            totalRecipients: uniqueEmails.length,
            sent,
            failed,
            failures,
            ms: Date.now() - startedAt,
        });
    } catch (err) {
        console.error("send-weekly-playlist error:", err);
        return res.status(500).json({ ok: false, error: err?.message || String(err) });
    }
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