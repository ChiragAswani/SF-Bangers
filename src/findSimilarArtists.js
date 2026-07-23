const Anthropic = require("@anthropic-ai/sdk");

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
    const { collectionName = "foopeeArtists", model = "claude-opus-4-8", mode } = opts;

    const candidatesMap = await getArtistCandidates(db, collectionName);
    const candidates = [...candidatesMap.keys()];
    if (candidates.length === 0) return [];

    const anthropic = new Anthropic({ apiKey });

    const modeInstruction = DISCOVERY_MODE_INSTRUCTIONS[mode] || "";

    const response = await anthropic.messages.create({
        model,
        max_tokens: 4096,
        thinking: { type: "adaptive" },
        output_config: { format: { type: "json_schema", schema: SIMILAR_ARTISTS_SCHEMA } },
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
                score: Math.max(0, Math.min(100, Math.round(a.score || 0))),
                showCount: shows.length,
                nextShow: nextShow
                    ? {
                          date: nextShow.date || null,
                          dayOfWeek: nextShow.dayOfWeek || null,
                          venue: nextShow.venue || null,
                          details: nextShow.details || null,
                      }
                    : null,
            };
        });
}

module.exports = { findSimilarArtists };