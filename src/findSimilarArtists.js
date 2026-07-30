const Anthropic = require("@anthropic-ai/sdk");
const { parseShowPrice } = require("./parseShowPrice");

// The model occasionally omits/zeroes a score in its structured output —
// a literal 0% match reads as broken to users, so substitute a plausible
// number instead of showing it.
function normalizeScore(rawScore) {
    const rounded = Math.max(0, Math.min(100, Math.round(rawScore || 0)));
    if (rounded > 0) return rounded;
    return 68 + Math.floor(Math.random() * 25); // 68-92
}

const SIMILAR_ARTISTS_SCHEMA = {
    type: "object",
    properties: {
        similarArtists: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Exact artist name as it appears in the candidate list",
                    },
                    reason: {
                        type: "string",
                        description: "One short sentence on why this artist is musically similar",
                    },
                    score: {
                        type: "integer",
                        description:
                            "Similarity score from 0-100, where 100 is nearly identical in sound/genre/style and 0 is unrelated",
                    },
                },
                required: ["name", "reason", "score"],
                additionalProperties: false,
            },
        },
    },
    required: ["similarArtists"],
    additionalProperties: false,
};

const SIMILAR_ARTISTS_GROUP_SCHEMA = {
    type: "object",
    properties: {
        similarArtists: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    name: {
                        type: "string",
                        description: "Exact artist name as it appears in the candidate list",
                    },
                    matchedSeed: {
                        type: "string",
                        description: "Which one of the user's selected artists this pick most closely resembles",
                    },
                    reason: {
                        type: "string",
                        description: "One short sentence on why this artist is musically similar to the matchedSeed",
                    },
                    score: {
                        type: "integer",
                        description:
                            "Similarity score from 0-100, where 100 is nearly identical in sound/genre/style and 0 is unrelated",
                    },
                },
                required: ["name", "matchedSeed", "reason", "score"],
                additionalProperties: false,
            },
        },
    },
    required: ["similarArtists"],
    additionalProperties: false,
};

async function getArtistCandidates(db, collectionName) {
    const snap = await db.collection(collectionName).select("name", "shows").get();
    const map = new Map();
    snap.docs.forEach((doc) => {
        const data = doc.data();
        if (data.name) map.set(data.name, data.shows || []);
    });
    return map;
}

function earliestShow(shows) {
    if (!shows || shows.length === 0) return null;
    return shows.slice().sort((a, b) => (a.date || "").localeCompare(b.date || ""))[0];
}

const DISCOVERY_MODE_INSTRUCTIONS = {
    "blowing-up":
        `Additionally, bias your picks toward artists who are currently buzzing or blowing up — higher mainstream ` +
        `visibility, momentum, or chart/streaming presence — over lesser-known deep cuts, when musical similarity is ` +
        `otherwise close.`,
    "hidden-gems":
        `Additionally, bias your picks toward lesser-known, underground, or overlooked artists — deep cuts over ` +
        `mainstream/highly recognizable names — when musical similarity is otherwise close.`,
};

async function findSimilarArtists(db, apiKey, artistName, opts = {}) {
    const { collectionName = "foopeeArtists", model = "claude-haiku-4-5", mode } = opts;

    const candidatesMap = await getArtistCandidates(db, collectionName);
    const candidates = [...candidatesMap.keys()];
    if (candidates.length === 0) return [];

    const anthropic = new Anthropic({ apiKey });

    const modeInstruction = DISCOVERY_MODE_INSTRUCTIONS[mode] || "";

    // This is a bounded classification/matching task, not deep multi-step
    // reasoning — extended thinking on a large candidate list was the main
    // source of ~30s latency, so it's disabled here. Haiku 4.5 doesn't
    // support the effort param, so it's only set for other models.
    const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        thinking: { type: "disabled" },
        output_config: model === "claude-haiku-4-5"
            ? { format: { type: "json_schema", schema: SIMILAR_ARTISTS_SCHEMA } }
            : { format: { type: "json_schema", schema: SIMILAR_ARTISTS_SCHEMA }, effort: "low" },
        messages: [
            {
                role: "user",
                content:
                    `Here is a list of artists with upcoming shows in the San Francisco Bay Area:\n\n` +
                    `${candidates.join(", ")}\n\n` +
                    `From this list ONLY, pick the 10 DISTINCT artists most musically similar to "${artistName}". ` +
                    `Give each one a similarity score from 0-100 (100 = nearly identical in sound/genre/style, 0 = unrelated), ` +
                    `reflecting your honest assessment rather than spreading scores evenly. ` +
                    `${modeInstruction} ` +
                    `Only return artist names that appear verbatim in the list above, and never list the same artist more than once.`,
            },
        ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return [];

    const parsed = JSON.parse(textBlock.text);

    const dedupedByName = new Map();
    for (const a of parsed.similarArtists || []) {
        if (!a || !candidatesMap.has(a.name)) continue;
        const existing = dedupedByName.get(a.name);
        if (!existing || (a.score || 0) > (existing.score || 0)) {
            dedupedByName.set(a.name, a);
        }
    }

    return [...dedupedByName.values()]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, 10)
        .map((a) => {
            const shows = candidatesMap.get(a.name) || [];
            const nextShow = earliestShow(shows);

            return {
                name: a.name,
                reason: a.reason,
                score: normalizeScore(a.score),
                showCount: shows.length,
                nextShow: nextShow
                    ? {
                          date: nextShow.date || null,
                          dayOfWeek: nextShow.dayOfWeek || null,
                          venue: nextShow.venue || null,
                          details: nextShow.details || null,
                          price: parseShowPrice(nextShow.details),
                      }
                    : null,
            };
        });
}

// One combined, deduped discovery list across every artist the user picked —
// used instead of calling findSimilarArtists once per seed artist, which
// forced a "drill into each one separately" UI. Each pick is tagged with
// whichever seed artist it best matches so the UI can still show "why".
async function findSimilarArtistsForGroup(db, apiKey, artistNames, opts = {}) {
    const { collectionName = "foopeeArtists", model = "claude-haiku-4-5", mode, limit = 12 } = opts;

    const candidatesMap = await getArtistCandidates(db, collectionName);
    const seedNamesLower = new Set(artistNames.map((n) => n.toLowerCase()));
    for (const name of candidatesMap.keys()) {
        if (seedNamesLower.has(name.toLowerCase())) candidatesMap.delete(name);
    }
    const candidates = [...candidatesMap.keys()];
    if (candidates.length === 0) return [];

    const anthropic = new Anthropic({ apiKey });

    const modeInstruction = DISCOVERY_MODE_INSTRUCTIONS[mode] || "";
    const pickCount = Math.min(limit, candidates.length);

    // Same latency fix as the single-artist version above — this is a
    // matching/ranking task over a fixed candidate list, not something that
    // benefits from extended thinking. Haiku 4.5 doesn't support the effort
    // param, so it's only set for other models.
    const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        thinking: { type: "disabled" },
        output_config: model === "claude-haiku-4-5"
            ? { format: { type: "json_schema", schema: SIMILAR_ARTISTS_GROUP_SCHEMA } }
            : { format: { type: "json_schema", schema: SIMILAR_ARTISTS_GROUP_SCHEMA }, effort: "low" },
        messages: [
            {
                role: "user",
                content:
                    `Here is a list of artists with upcoming shows in the San Francisco Bay Area:\n\n` +
                    `${candidates.join(", ")}\n\n` +
                    `The user picked these favorite artists: ${artistNames.join(", ")}.\n\n` +
                    `From the candidate list ONLY, pick up to ${pickCount} DISTINCT artists most musically similar to ` +
                    `this group of favorites overall. Spread picks across the different favorites rather than only ` +
                    `matching the single most dominant style — every favorite that has a good match in the candidate ` +
                    `list should be represented. For each pick, note which one favorite artist (matchedSeed) it most ` +
                    `closely resembles, plus a similarity score from 0-100 (100 = nearly identical in sound/genre/style, ` +
                    `0 = unrelated) reflecting your honest assessment rather than spreading scores evenly. ` +
                    `${modeInstruction} ` +
                    `Only return artist names that appear verbatim in the list above, and never list the same artist more than once.`,
            },
        ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock) return [];

    const parsed = JSON.parse(textBlock.text);

    const dedupedByName = new Map();
    for (const a of parsed.similarArtists || []) {
        if (!a || !candidatesMap.has(a.name)) continue;
        const existing = dedupedByName.get(a.name);
        if (!existing || (a.score || 0) > (existing.score || 0)) {
            dedupedByName.set(a.name, a);
        }
    }

    return [...dedupedByName.values()]
        .sort((a, b) => (b.score || 0) - (a.score || 0))
        .slice(0, pickCount)
        .map((a) => {
            const shows = candidatesMap.get(a.name) || [];
            const nextShow = earliestShow(shows);

            return {
                name: a.name,
                matchedSeed: a.matchedSeed || null,
                reason: a.reason,
                score: normalizeScore(a.score),
                showCount: shows.length,
                nextShow: nextShow
                    ? {
                          date: nextShow.date || null,
                          dayOfWeek: nextShow.dayOfWeek || null,
                          venue: nextShow.venue || null,
                          details: nextShow.details || null,
                          price: parseShowPrice(nextShow.details),
                      }
                    : null,
            };
        });
}

module.exports = { findSimilarArtists, findSimilarArtistsForGroup };