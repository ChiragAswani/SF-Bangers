const Anthropic = require("@anthropic-ai/sdk");

async function requestTicketLinks(anthropic, model, validEvents) {
    const eventList = validEvents
        .map((e, i) => `${i + 1}. Artist: ${e.artist} | Venue: ${e.venue} | Date: ${e.date}`)
        .join("\n");

    const response = await anthropic.messages.create({
        model,
        max_tokens: 8192,
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
            {
                type: "web_fetch_20260318",
                name: "web_fetch",
                max_uses: Math.min(validEvents.length * 2, 20),
                max_content_tokens: 3000,
                allowed_callers: ["direct"],
            },
        ],
        messages: [
            {
                role: "user",
                content:
                    `Find the official ticket purchase link and current ticket price for each of these concerts in the San Francisco Bay Area:\n\n` +
                    `${eventList}\n\n` +
                    `For each event: search the web for its real, current ticket page (venue's own site, Ticketmaster, AXS, DICE, Eventbrite, etc), ` +
                    `then fetch that page to read the lowest listed ticket price directly off of it — search result snippets usually don't ` +
                    `include price, so you must fetch the page to get an accurate price. ` +
                    `Do this silently: do not narrate your search process, and do not add any explanation, notes, or caveats to your ` +
                    `final reply. Your entire final reply must be ONLY the JSON array below, nothing before or after it: ` +
                    `[{"artist": "<exact artist name from the list>", "ticketLink": "<url or null>", "price": "<price string or null>"}, ...] ` +
                    `(one object per event, same order as the list). ` +
                    `"price" must be SHORT — just the number, like "$45", "$45+", "$31–67", or "Free" — with no extra words, notes, or commentary in that field. ` +
                    `If you can't verify a real link for a specific artist/venue/date, set its ticketLink and price to null. Never invent or guess a URL or a price.`,
            },
        ],
    });

    if (response.stop_reason === "max_tokens") {
        console.error("getTicketLinks: response truncated at max_tokens");
    }

    // The model can emit several text blocks (e.g. trailing citation fragments after
    // web_fetch calls), so the JSON array isn't guaranteed to be in the last one —
    // concatenate everything in order and locate the last top-level [...] in it via
    // bracket matching (a plain greedy regex would over-match if any stray brackets,
    // like citation markers, show up in prose after the array).
    const allText = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
    if (!allText) return null;

    const lastOpen = allText.lastIndexOf("[");
    if (lastOpen === -1) return null;

    let depth = 0;
    let endIdx = -1;
    for (let i = lastOpen; i < allText.length; i++) {
        if (allText[i] === "[") depth++;
        else if (allText[i] === "]") {
            depth--;
            if (depth === 0) {
                endIdx = i;
                break;
            }
        }
    }
    if (endIdx === -1) return null;

    let parsed;
    try {
        parsed = JSON.parse(allText.slice(lastOpen, endIdx + 1));
    } catch {
        return null;
    }
    if (!Array.isArray(parsed)) return null;

    return parsed
        .filter((r) => r && typeof r.artist === "string")
        .map((r) => ({
            artist: r.artist,
            ticketLink: typeof r.ticketLink === "string" && /^https:\/\//i.test(r.ticketLink) ? r.ticketLink : null,
            price: typeof r.price === "string" && r.price.trim() ? r.price.trim().slice(0, 30) : null,
        }));
}

async function getTicketLinks(apiKey, events, opts = {}) {
    const { model = "claude-opus-4-8", timeoutMs = 150000, retries = 1 } = opts;

    const validEvents = (events || []).filter((e) => e && e.artist && e.venue && e.date);
    if (validEvents.length === 0) return [];

    const anthropic = new Anthropic({ apiKey, timeout: timeoutMs });

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const results = await requestTicketLinks(anthropic, model, validEvents);
            if (results) return results;
            console.error(`getTicketLinks: attempt ${attempt + 1} produced no parseable result`);
        } catch (err) {
            console.error(`getTicketLinks: attempt ${attempt + 1} error:`, err?.message || err);
        }
    }

    return [];
}

module.exports = { getTicketLinks };
