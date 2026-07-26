// Foopee's scraped "details" text crams door price, age restriction, and
// showtime into one free-form string, e.g. `"a/a $249 ($549 3-day pass) 11am #"`
// or `"a/a $68 (12 and under free / studnts 13-17 $25) 11:30am"`. The
// parenthetical part is consistently an upsell (VIP, multi-day pass) or a
// discount carve-out (kids, students) — never the base price — so it's
// stripped before looking for the real price.
function stripAmountZeroCents(raw) {
    return raw.endsWith(".00") ? raw.slice(0, -3) : raw;
}

function parseShowPrice(details) {
    if (!details) return null;
    const cleaned = details.replace(/\([^)]*\)/g, " ");

    // A hyphen/slash directly between two dollar amounts is either a real
    // range ("$5-$15") or a two-tier price ("$27/$30" advance/door,
    // matinee/evening, etc) — either way, showing it as a range is accurate.
    const pair = cleaned.match(/\$(\d+(?:\.\d{1,2})?)\s*[-–/]\s*\$?(\d+(?:\.\d{1,2})?)/);
    if (pair) {
        const low = stripAmountZeroCents(pair[1]);
        const high = stripAmountZeroCents(pair[2]);
        return low === high ? `$${low}` : `$${low}–${high}`;
    }

    const single = cleaned.match(/\$(\d+(?:\.\d{1,2})?)(\+)?/);
    if (single) return `$${stripAmountZeroCents(single[1])}${single[2] || ""}`;

    if (/\bfree\b/i.test(cleaned)) return "Free";

    return null;
}

module.exports = { parseShowPrice };
