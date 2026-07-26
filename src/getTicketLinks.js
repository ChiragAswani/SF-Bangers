const axios = require("axios");

const TICKETMASTER_ATTRACTIONS_URL = "https://app.ticketmaster.com/discovery/v2/attractions.json";
const TICKETMASTER_EVENTS_URL = "https://app.ticketmaster.com/discovery/v2/events.json";

const ATTRACTION_CACHE_COLLECTION = "ticketAttractionCache";
const SHOW_CACHE_COLLECTION = "ticketLinkCache";
// An artist's Ticketmaster attraction essentially never changes, so this cache
// entry is reused across every show for that artist, in this batch and future
// ones — resolved once, then free for a month.
const ATTRACTION_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Show-level link/price can drift a bit faster (on-sale dates, sellouts).
const SHOW_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Serializes every real Ticketmaster HTTP call (across both endpoints) at
// least MIN_CALL_INTERVAL_MS apart, regardless of how many attraction/event
// lookups end up happening — keeps us safely under their 5 requests/sec cap
// without the callers needing to reason about pacing themselves.
const MIN_CALL_INTERVAL_MS = 220;
let lastCallAt = 0;
async function throttledGet(url, config) {
    const wait = lastCallAt + MIN_CALL_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    return axios.get(url, config);
}

function normalize(s) {
    return (s || "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

// Firestore doc IDs can't contain "/" — normalize() already strips that (and
// everything else non-alphanumeric) so joining normalized parts is safe as-is.
function cacheKey(...parts) {
    const raw = parts.map(normalize).join("__").trim();
    return (raw || "unknown").slice(0, 1500);
}

async function readCache(db, collection, key, ttlMs) {
    const doc = await db.collection(collection).doc(key).get();
    if (!doc.exists) return undefined;
    const data = doc.data();
    if (!data?.fetchedAt) return undefined;
    const fetchedAtMs = typeof data.fetchedAt.toMillis === "function" ? data.fetchedAt.toMillis() : new Date(data.fetchedAt).getTime();
    if (!Number.isFinite(fetchedAtMs) || Date.now() - fetchedAtMs > ttlMs) return undefined;
    return data;
}

async function writeCache(db, collection, key, data) {
    await db.collection(collection).doc(key).set({ ...data, fetchedAt: new Date() }, { merge: true });
}

// Resolves an artist name to their verified official Ticketmaster attraction.
// Ticketmaster's keyword search on both /attractions and /events returns
// tribute bands and themed nights alongside the real artist (e.g. searching
// "Bad Bunny" also surfaces "Bad Bunny Rave" and "Bad Bunny Night - Tribute"
// as legitimate-looking attractions/events) — a name match alone isn't enough
// to trust. Real artist entities are the ones with populated externalLinks
// (a verified Spotify/social/homepage presence); fan-made tribute and
// theme-night attractions never have any.
async function resolveAttraction(apiKey, artist) {
    let attractions;
    try {
        const res = await throttledGet(TICKETMASTER_ATTRACTIONS_URL, {
            params: { apikey: apiKey, keyword: artist, size: 20, classificationName: "Music" },
            timeout: 8000,
            validateStatus: (s) => s === 200 || s === 404,
        });
        attractions = Array.isArray(res.data?._embedded?.attractions) ? res.data._embedded.attractions : [];
    } catch (err) {
        console.error(`getTicketLinks: attraction lookup failed for "${artist}":`, err?.message || err);
        return null;
    }

    const target = normalize(artist);
    const verified = attractions.filter((a) => a?.externalLinks && Object.keys(a.externalLinks).length > 0);

    const exact = verified.find((a) => normalize(a.name) === target);
    if (exact) return exact;

    // Loose prefix match catches legitimate co-headline billings, e.g. an
    // attraction named "Billie Eilish with Denzel Curry" for a real Billie
    // Eilish query.
    return (
        verified.find((a) => {
            const n = normalize(a.name);
            return n.startsWith(`${target} `) || target.startsWith(`${n} `);
        }) || null
    );
}

// `localStartDateTime` filters on the event's own local time (not UTC), so an
// evening SF show landing after midnight UTC still matches the calendar date
// we already have from Foopee. Filtering by attractionId (rather than a text
// keyword) guarantees every result is a real show by the verified artist.
async function findEventForShow(apiKey, attractionId, { venue, date }) {
    let events;
    try {
        const res = await throttledGet(TICKETMASTER_EVENTS_URL, {
            params: {
                apikey: apiKey,
                attractionId,
                localStartDateTime: `${date}T00:00:00,${date}T23:59:59`,
                size: 10,
            },
            timeout: 8000,
            validateStatus: (s) => s === 200 || s === 404,
        });
        events = Array.isArray(res.data?._embedded?.events) ? res.data._embedded.events : [];
    } catch (err) {
        console.error(`getTicketLinks: event lookup failed for attraction "${attractionId}":`, err?.message || err);
        return null;
    }

    if (events.length === 0) return null;
    if (events.length === 1) return events[0];

    const targetVenue = normalize(venue);
    const venueMatch = events.find((e) => {
        const v = normalize(e._embedded?.venues?.[0]?.name);
        return v && targetVenue && (v.includes(targetVenue) || targetVenue.includes(v));
    });
    return venueMatch || events[0];
}

function pickTicketUrl(event) {
    return typeof event.url === "string" && /^https:\/\//i.test(event.url) ? event.url : null;
}

function pickPrice(event) {
    const range = Array.isArray(event.priceRanges) ? event.priceRanges[0] : null;
    if (!range) return null;
    const low = typeof range.min === "number" ? Math.round(range.min) : null;
    const high = typeof range.max === "number" ? Math.round(range.max) : null;
    if (low != null && high != null && high > low) return `$${low}–${high}`;
    if (low != null) return `$${low}+`;
    return null;
}

async function getAttractionId(db, apiKey, artist) {
    const key = cacheKey(artist);
    const cached = await readCache(db, ATTRACTION_CACHE_COLLECTION, key, ATTRACTION_CACHE_TTL_MS).catch((err) => {
        console.error("getTicketLinks: attraction cache read failed:", err?.message || err);
        return undefined;
    });
    if (cached !== undefined) return cached.attractionId ?? null;

    const attraction = await resolveAttraction(apiKey, artist);
    const attractionId = attraction?.id || null;
    writeCache(db, ATTRACTION_CACHE_COLLECTION, key, { attractionId }).catch((err) =>
        console.error("getTicketLinks: attraction cache write failed:", err?.message || err)
    );
    return attractionId;
}

async function lookupShow(db, apiKey, event) {
    const showKey = cacheKey(event.artist, event.venue, event.date);
    const cachedShow = await readCache(db, SHOW_CACHE_COLLECTION, showKey, SHOW_CACHE_TTL_MS).catch((err) => {
        console.error("getTicketLinks: show cache read failed:", err?.message || err);
        return undefined;
    });
    if (cachedShow !== undefined) {
        return { artist: event.artist, ticketLink: cachedShow.ticketLink ?? null, price: cachedShow.price ?? null };
    }

    const attractionId = await getAttractionId(db, apiKey, event.artist);
    const match = attractionId ? await findEventForShow(apiKey, attractionId, event) : null;

    const result = { ticketLink: match ? pickTicketUrl(match) : null, price: match ? pickPrice(match) : null };
    writeCache(db, SHOW_CACHE_COLLECTION, showKey, result).catch((err) =>
        console.error("getTicketLinks: show cache write failed:", err?.message || err)
    );
    return { artist: event.artist, ...result };
}

// Every show (and every artist's attraction resolution) is cached in
// Firestore so repeat requests for the same show — from other users, or the
// same user browsing again — are served without touching Ticketmaster at
// all. Real cache misses are processed one at a time; throttledGet already
// paces the underlying HTTP calls, so this loop doesn't need its own delay.
async function getTicketLinks(db, apiKey, events) {
    const validEvents = (events || []).filter((e) => e && e.artist && e.venue && e.date);
    if (validEvents.length === 0) return [];

    if (!apiKey) {
        console.error("getTicketLinks: missing Ticketmaster apikey");
        return validEvents.map((e) => ({ artist: e.artist, ticketLink: null, price: null }));
    }

    const results = [];
    for (const event of validEvents) {
        results.push(await lookupShow(db, apiKey, event));
    }
    return results;
}

module.exports = { getTicketLinks };
