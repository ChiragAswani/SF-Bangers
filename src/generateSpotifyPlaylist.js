// spotifyHelpers.js
// One-file drop-in: proactive global rate limiter + robust spotifyFetch
// Uses node-fetch in Node < 18. In Node 18+, global fetch exists, so node-fetch is optional.

// ---- fetch setup (Node 18+ has global fetch) ----
let fetchFn = globalThis.fetch;
if (!fetchFn) {
    // eslint-disable-next-line global-require
    fetchFn = require("node-fetch");
}

// ---- tiny helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shorten = (s, n = 200) => (!s ? "" : s.length > n ? s.slice(0, n) + "…" : s);

// ---- proactive global limiter (adaptive) ----
class SpotifyLimiter {
    constructor({ initialRps = 6, minRps = 1, maxRps = 12 } = {}) {
        this.minIntervalMs = Math.ceil(1000 / initialRps);
        this.minIntervalFloorMs = Math.ceil(1000 / maxRps); // fastest allowed
        this.minIntervalCeilMs = Math.ceil(1000 / minRps);  // slowest allowed

        this._nextAt = 0;
        this._cooldownUntil = 0;

        // for gentle ramp-up
        this._successStreak = 0;
    }

    _jitter(ms) {
        return ms + Math.floor(Math.random() * 80);
    }

    async waitTurn() {
        const now = Date.now();
        const t0 = Math.max(this._cooldownUntil, this._nextAt, now);
        const waitMs = t0 - now;
        if (waitMs > 0) await sleep(this._jitter(waitMs));
        this._nextAt = Date.now() + this.minIntervalMs;
    }

    onRateLimit(retryAfterHeader) {
        const now = Date.now();
        const retryAfterSec = Number(retryAfterHeader || "0");
        const raMs = retryAfterSec > 0 ? retryAfterSec * 1000 : 1500;

        this._cooldownUntil = Math.max(this._cooldownUntil, now + raMs);

        // multiplicative decrease (slow down pacing)
        this.minIntervalMs = Math.min(
            this.minIntervalCeilMs,
            Math.ceil(this.minIntervalMs * 1.4)
        );

        this._successStreak = 0;
    }

    onTransientError() {
        // slow down a bit on 5xx/timeout-ish responses
        this.minIntervalMs = Math.min(
            this.minIntervalCeilMs,
            Math.ceil(this.minIntervalMs * 1.15)
        );
        this._successStreak = 0;
    }

    onSuccess() {
        this._successStreak += 1;

        // additive increase (speed back up slowly)
        // only speed up after some sustained success so we don't yo-yo
        if (this._successStreak >= 20) {
            this.minIntervalMs = Math.max(
                this.minIntervalFloorMs,
                Math.floor(this.minIntervalMs * 0.95)
            );
            this._successStreak = 0;
        }
    }
}

// single global limiter instance for your whole process
const spotifyLimiter = new SpotifyLimiter({ initialRps: 6, maxRps: 12 });

// ---- robust fetch wrapper ----
async function spotifyFetch(url, accessToken, options = {}) {
    const {
        retries = 10,
        baseDelayMs = 750,
        maxDelayMs = 120_000,
        debug = true,
        label = "",
        ...fetchOptions
    } = options;

    const method = (fetchOptions.method || "GET").toUpperCase();
    const tag = label ? ` [${label}]` : "";

    for (let attempt = 0; attempt <= retries; attempt++) {
        await spotifyLimiter.waitTurn();

        if (debug) {
            console.log(
                `🎧 SpotifyFetch${tag} → ${method} ${url} (attempt ${attempt + 1}/${retries + 1}) @ ${new Date().toISOString()} | pace=${spotifyLimiter.minIntervalMs}ms`
            );
        }

        const start = Date.now();

        // Only set content-type if we are sending a JSON body
        const headers = {
            Authorization: `Bearer ${accessToken}`,
            ...(fetchOptions.headers || {}),
        };
        const hasBody = fetchOptions.body != null && method !== "GET" && method !== "HEAD";
        if (hasBody && !headers["Content-Type"] && !headers["content-type"]) {
            headers["Content-Type"] = "application/json";
        }

        let res;
        try {
            res = await fetchFn(url, {
                ...fetchOptions,
                method,
                headers,
            });
        } catch (err) {
            // network-ish error -> retry with backoff
            spotifyLimiter.onTransientError();
            const backoffMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
            const jitterMs = Math.floor(Math.random() * 300);
            const waitMs = backoffMs + jitterMs;

            if (debug) {
                console.warn(
                    `🌐 SpotifyFetch${tag} NETWORK ERROR\n` +
                    `   err: ${err?.message || err}\n` +
                    `   waiting: ${waitMs}ms | attempt ${attempt + 1}/${retries + 1}`
                );
            }

            if (attempt === retries) throw err;
            await sleep(waitMs);
            continue;
        }

        const ms = Date.now() - start;

        if (res.status === 204) {
            spotifyLimiter.onSuccess();
            if (debug) console.log(`✅ SpotifyFetch${tag} ← 204 No Content (${ms}ms)`);
            return null;
        }

        const contentType = res.headers.get("content-type") || "";
        const rawText = await res.text().catch(() => "");
        const maybeJson =
            contentType.includes("application/json") && rawText
                ? (() => {
                    try {
                        return JSON.parse(rawText);
                    } catch {
                        return null;
                    }
                })()
                : null;

        if (res.ok) {
            spotifyLimiter.onSuccess();
            if (debug) console.log(`✅ SpotifyFetch${tag} ← ${res.status} (${ms}ms)`);
            return maybeJson ?? rawText;
        }

        // 429 rate limiting
        if (res.status === 429) {
            const raHeader = res.headers.get("retry-after");
            spotifyLimiter.onRateLimit(raHeader);

            const retryAfterSec = Number(raHeader || "0");
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
            spotifyLimiter.onTransientError();

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

        console.error(
            `❌ SpotifyFetch${tag} FAIL ${res.status} ${res.statusText} (${ms}ms)\n   resp: ${shorten(msg)}`
        );
        throw new Error(
            `Spotify API error ${res.status} ${res.statusText}\nURL: ${url}\nRESP: ${msg}`
        );
    }

    throw new Error(
        `Spotify API error 429 Too Many Requests\nURL: ${url}\nRESP: Rate limited even after retries`
    );
}

module.exports = { spotifyFetch };