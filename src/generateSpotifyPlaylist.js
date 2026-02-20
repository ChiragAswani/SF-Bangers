const SPOTIFY_API = "https://api.spotify.com/v1";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shorten = (s, n = 200) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s);

async function spotifyFetch(url, accessToken, options = {}) {
    const {
        retries = 10,
        baseDelayMs = 750,
        maxDelayMs = 120_000, // allow > 60s waits if Retry-After is missing
        debug = true,
        label = "",
        ...fetchOptions
    } = options;

    const method = (fetchOptions.method || "GET").toUpperCase();
    const tag = label ? ` [${label}]` : "";

    for (let attempt = 0; attempt <= retries; attempt++) {
        if (debug) {
            console.log(
                `🎧 SpotifyFetch${tag} → ${method} ${url} (attempt ${attempt + 1}/${retries + 1}) @ ${new Date().toISOString()}`
            );
        }

        const start = Date.now();
        const res = await fetch(url, {
            ...fetchOptions,
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
                ...(fetchOptions.headers || {}),
            },
        });
        const ms = Date.now() - start;

        if (res.status === 204) {
            if (debug) console.log(`✅ SpotifyFetch${tag} ← 204 No Content (${ms}ms)`);
            return null;
        }

        // Safely read body (avoid "Unexpected token T" when it isn't JSON)
        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text().catch(() => "");
        const maybeJson =
            contentType.includes("application/json") && rawText
                ? (() => {
                    try { return JSON.parse(rawText); } catch { return null; }
                })()
                : null;

        if (res.ok) {
            if (debug) console.log(`✅ SpotifyFetch${tag} ← ${res.status} (${ms}ms)`);
            return maybeJson ?? rawText;
        }

        // 429 rate limiting
        if (res.status === 429) {
            const raHeader = res.headers.get("retry-after");
            const retryAfterSec = Number(raHeader || "0");

            // If Retry-After missing/0, exponential backoff anyway
            const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
            const jitterMs = Math.floor(Math.random() * 300);

            const waitMs =
                retryAfterSec > 0 ? retryAfterSec * 1000 + jitterMs : backoffMs + jitterMs;

            if (debug) {
                console.warn(
                    `⏳ SpotifyFetch${tag} 429 RATE LIMITED (${ms}ms)\n` +
                    `   retry-after: ${raHeader ?? "(missing)"} | waiting: ${waitMs}ms | attempt ${attempt + 1}/${retries + 1}\n` +
                    `   resp: ${shorten(rawText)}`
                );
            }

            if (attempt === retries) break;
            await sleep(waitMs);
            continue;
        }

        // Retry on some transient errors
        const retryable = [408, 409, 500, 502, 503, 504].includes(res.status);
        if (retryable && attempt < retries) {
            const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
            const jitterMs = Math.floor(Math.random() * 300);
            const waitMs = backoffMs + jitterMs;

            if (debug) {
                console.warn(
                    `🔁 SpotifyFetch${tag} ${res.status} RETRYABLE (${ms}ms)\n` +
                    `   waiting: ${waitMs}ms | attempt ${attempt + 1}/${retries + 1}\n` +
                    `   resp: ${shorten(rawText)}`
                );
            }

            await sleep(waitMs);
            continue;
        }

        const msg =
            (maybeJson && (maybeJson.error?.message || JSON.stringify(maybeJson))) ||
            rawText ||
            res.statusText;

        console.error(`❌ SpotifyFetch${tag} FAIL ${res.status} ${res.statusText} (${ms}ms)\n   resp: ${shorten(msg)}`);
        throw new Error(`Spotify API error ${res.status} ${res.statusText}\nURL: ${url}\nRESP: ${msg}`);
    }

    throw new Error(`Spotify API error 429 Too Many Requests\nURL: ${url}\nRESP: Rate limited even after retries`);
}

async function generatePlaylistTop5PerArtist(accessToken, artistNames, name, description) {
    const data = await spotifyFetch(`${SPOTIFY_API}/me/playlists`, accessToken, {
        method: "POST",
        body: JSON.stringify({ name, description, public: true}),
        label: "create-playlist",
    });
    const playlistId = data.id;
    for (const artist of artistNames) {
        const res = await spotifyFetch(`${SPOTIFY_API}/search?q=artist:${artist}&type=track&limit=10`, accessToken, {
            method: "GET",
            label: `search:${artist}`,
        });
        const uris = [];
        for (const i of res.tracks.items) {
             uris.push(i.uri)
        }
        try {
            await spotifyFetch(`${SPOTIFY_API}/playlists/${playlistId}/items`, accessToken, {
                method: "POST",
                body: JSON.stringify({ uris }),
                label: `add:${artist}`,
            });
        } catch (e) {
            console.log(`Unable to add any songs for ${artist}`, uris, e.message)
        }
    }
    return data.id;
}

module.exports = {generatePlaylistTop5PerArtist};