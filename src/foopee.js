const cheerio = require("cheerio");
const axios = require("axios");
const START_PAGE = "http://www.foopee.com/punk/the-list/by-date.0.html";

async function getArtistsForFoopeeWeek(dateRange, opts = {}) {
    const {
        startUrl = START_PAGE,
        timeoutMs = 15000,
        userAgent = "Mozilla/5.0 (compatible; FoopeeScraper/1.0; +https://example.com)",
    } = opts;

    const html0 = await fetchHtml(startUrl, { timeoutMs, userAgent });
    const urlForWeek = resolveWeekUrlFromStartPage(html0, startUrl, dateRange);

    if (!urlForWeek) {
        throw new Error(
            `Could not find date range "${dateRange}" on ${startUrl}. ` +
            `Make sure the string matches exactly (including spacing/case).`
        );
    }

    const weekHtml = urlForWeek === startUrl ? html0 : await fetchHtml(urlForWeek, { timeoutMs, userAgent });
    return extractArtistsFromWeekHtml(weekHtml);
}

async function fetchHtml(url, { timeoutMs, userAgent }) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": userAgent,
                "Accept": "text/html,application/xhtml+xml",
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
        return await res.text();
    } finally {
        clearTimeout(t);
    }
}

function resolveWeekUrlFromStartPage(startHtml, startUrl, dateRange) {
    const $ = cheerio.load(startHtml);
    const headerText = $("h1,h2,h3,title").first().text().trim();
    const headerRange = matchDateRange(headerText);
    if (headerRange && headerRange === dateRange) return startUrl;
    let href =
        $("a")
            .toArray()
            .map((a) => ({ text: $(a).text().trim(), href: $(a).attr("href") }))
            .find((x) => x.text === dateRange && x.href)?.href || null;
    if (!href) {
        const anyHeader = $("h1,h2,h3").toArray().map((h) => $(h).text().trim());
        if (anyHeader.some((t) => matchDateRange(t) === dateRange)) return startUrl;
    }

    if (!href) return null;
    return new URL(href, startUrl).toString();
}

function matchDateRange(s) {
    const m = s.match(/\b[A-Z][a-z]{2}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2}\b/);
    return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

function extractArtistsFromWeekHtml(weekHtml) {
    const $ = cheerio.load(weekHtml);
    let bodyHtml = $("body").html() || "";
    bodyHtml = bodyHtml.replace(/<br\s*\/?>/gi, "\n");
    const text = cheerio.load(`<body>${bodyHtml}</body>`).text();
    const lines = text
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    const artists = new Set();

    for (const line of lines) {
        if (looksLikeDateNavOrDayHeader(line)) continue;
        const extracted = extractArtistsFromListingLine(line);
        for (const a of extracted) artists.add(a);
    }

    return [...artists];
}

function looksLikeDateNavOrDayHeader(line) {
    if (/^\b[A-Z][a-z]{2}\s+\d{1,2}\s*-\s*[A-Z][a-z]{2}\s+\d{1,2}\b$/.test(line)) return true;
    if (/^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+[A-Z][a-z]{2}\s+\d{1,2}\.?$/.test(line)) return true;
    if (/^Listing By Date/i.test(line)) return true;
    return false;
}

function extractArtistsFromListingLine(line) {
    const dotIdx = line.indexOf(". ");
    if (dotIdx === -1) return [];
    let after = line.slice(dotIdx + 2).trim();
    if (!after) return [];
    const cut = after.search(
        /\s(?:a\/a|AA\b|\$|\d{1,2}:\d{2}(?:am|pm)?|\d{1,2}(?:am|pm)\b|doors?\b|sold out\b|all ages\b|\d{1,2}\+)\b/i
    );
    if (cut > 0) after = after.slice(0, cut).trim();
    after = after.replace(/\s+#.*$/g, "").trim();
    after = after.replace(/\s+;\s+.*$/g, after.includes(",") ? after : after); // conservative
    const parts = splitArtists(after);
    return parts
        .map((p) => p.trim())
        .filter(Boolean)
        .filter((p) => p.length >= 2)
        .filter((p) => !/^(tba|tb a|unknown)$/i.test(p));
}

function splitArtists(s) {
    return s
        .split(/\s*(?:,|\bw\/\b|\bwith\b)\s*/i)
        .map((x) => x.trim())
        .filter(Boolean);
}

const ROOT_URL = "http://www.foopee.com/punk/the-list/";

/**
 * Scrapes http://www.foopee.com/punk/the-list/ and returns
 * an array of unique concert date-range strings (in page order),
 * e.g. ["Feb 16 - Feb 22", "Feb 23 - Mar 1", ...]
 */
async function getFoopeeConcertRangesByDate(opts = {}) {
    const {
        url = ROOT_URL,
        timeoutMs = 30000,
        retries = 3,
        userAgent = "Mozilla/5.0 (compatible; FoopeeScraper/1.0)",
    } = opts;

    const html = await fetchHtmlWithRetry(url, { timeoutMs, retries, userAgent });
    const $ = cheerio.load(html);

    const ranges = [];
    const seen = new Set();

    // Grab all visible link texts + some surrounding text chunks
    // because Foopee pages can be simple/old-school.
    const candidates = new Set();

    $("a").each((_, a) => {
        const t = $(a).text().replace(/\s+/g, " ").trim();
        if (t) candidates.add(t);
    });

    // Also scan the full page text for ranges that aren't anchor text
    const pageText = $("body").text().replace(/\s+/g, " ").trim();
    for (const m of pageText.matchAll(DATE_RANGE_REGEX_G)) {
        candidates.add(m[0].replace(/\s+/g, " ").trim());
    }

    // Filter to date ranges and keep stable order:
    // first in-document scan of anchors, then text matches.
    $("a").each((_, a) => {
        const t = $(a).text().replace(/\s+/g, " ").trim();
        const r = normalizeRangeIfMatch(t);
        if (r && !seen.has(r)) {
            seen.add(r);
            ranges.push(r);
        }
    });

    for (const c of candidates) {
        const r = normalizeRangeIfMatch(c);
        if (r && !seen.has(r)) {
            seen.add(r);
            ranges.push(r);
        }
    }

    return ranges;
}

const DATE_RANGE_REGEX_G =
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s*-\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\b/g;

function normalizeRangeIfMatch(s) {
    if (!s) return null;
    const m = s.match(DATE_RANGE_REGEX_G);
    if (!m || m.length === 0) return null;

    // If a string contains multiple ranges, return the first one.
    // (You can change this to return all if you want.)
    return m[0].replace(/\s+/g, " ").trim();
}

async function fetchHtmlWithRetry(url, { timeoutMs, retries, userAgent }) {
    let lastErr;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const res = await axios.get(url, {
                timeout: timeoutMs,
                maxRedirects: 5,
                responseType: "text",
                headers: {
                    "User-Agent": userAgent,
                    "Accept": "text/html,*/*",
                    "Connection": "close",
                },
                validateStatus: (s) => s >= 200 && s < 400,
            });
            return res.data;
        } catch (err) {
            lastErr = err;
            // backoff: 300ms, 900ms, 2700ms...
            await new Promise((r) => setTimeout(r, 300 * Math.pow(3, attempt - 1)));
        }
    }
    throw lastErr;
}

module.exports = { getArtistsForFoopeeWeek, getFoopeeConcertRangesByDate };