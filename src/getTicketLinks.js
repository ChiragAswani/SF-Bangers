const Anthropic = require("@anthropic-ai/sdk");

async function getTicketLinks(apiKey, events, opts = {}) {
    const { model = "claude-opus-4-8", timeoutMs = 150000 } = opts;

    const validEvents = (events || []).filter((e) => e && e.artist && e.venue && e.date);
    if (validEvents.length === 0) return [];

    const anthropic = new Anthropic({ apiKey, timeout: timeoutMs });

    const eventList = validEvents
        .map((e, i) => `${i + 1}. Artist: ${e.artist} | Venue: ${e.venue} | Date: ${e.date}`)
        .join("\n");

    let response;
    try {
        response = await anthropic.messages.create({
            model,
            max_tokens: 4096,
            tools: [
                {
                    type: "web_search_20260318",
                    name: "web_search",
                    max_uses: Math.min(validEvents.length * 2, 20),
                    // Force one-search-at-a-time. Without this the model can route web_search
                    // calls through its code_execution sandbox and fire several in parallel via
                    // asyncio.gather, which burns through max_uses on the first event and leaves
                    // every subsequent event unsearched (all results silently null).
                    allowed_callers: ["direct"],
                    user_location: { type: "approximate", city: "San Francisco", region: "California", country: "US" },
                },
            ],
            messages: [
                {
                    role: "user",
                    content:
                        `Find the official ticket purchase link for each of these concerts in the San Francisco Bay Area:\n\n` +
                        `${eventList}\n\n` +
                        `Search the web for each show's real, current ticket page (venue's own site, Ticketmaster, AXS, DICE, Eventbrite, etc). ` +
                        `Respond with ONLY a JSON array, no other text, with one object per event in the same order: ` +
                        `[{"artist": "<exact artist name from the list>", "ticketLink": "<url or null>"}, ...]. ` +
                        `If you can't verify a real link for a specific artist/venue/date, set its ticketLink to null. Never invent or guess a URL.`,
                },
            ],
        });
    } catch (err) {
        console.error("getTicketLinks error:", err?.message || err);
        return [];
    }

    const textBlock = [...response.content].reverse().find((b) => b.type === "text");
    if (!textBlock) return [];

    const match = textBlock.text.match(/\[[\s\S]*\]/);
    if (!match) return [];

    let parsed;
    try {
        parsed = JSON.parse(match[0]);
    } catch {
        return [];
    }
    if (!Array.isArray(parsed)) return [];

    return parsed
        .filter((r) => r && typeof r.artist === "string")
        .map((r) => ({
            artist: r.artist,
            ticketLink: typeof r.ticketLink === "string" && /^https:\/\//i.test(r.ticketLink) ? r.ticketLink : null,
        }));
}

module.exports = { getTicketLinks };
