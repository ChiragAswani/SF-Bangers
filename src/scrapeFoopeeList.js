const cheerio = require("cheerio");
const axios = require("axios");

const ROOT_URL = "http://www.foopee.com/punk/the-list/";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

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
                validateStatus: s => s >= 200 && s < 400,
            });
            return res.data;
        } catch (err) {
            lastErr = err;
            await sleep(300 * Math.pow(3, attempt - 1));
        }
    }
    throw lastErr;
}

// Firestore doc IDs can't contain "/", can't be "." or "..", and can't match __.*__.
function sanitizeArtistDocId(name) {
    let id = (name || "").trim().replace(/\//g, "-");
    if (!id || id === "." || id === ".." || /^__.*__$/.test(id)) id = `artist-${slugifyFallback(name)}`;
    return id.slice(0, 1500);
}

function slugifyFallback(s) {
    return (s || "unknown")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "unknown";
}

function getDateRangeLinks(rootHtml, rootUrl) {
    const $ = cheerio.load(rootHtml);
    const links = [];
    $('a[href^="by-date."]').each((_, a) => {
        const href = $(a).attr("href");
        const text = $(a).text().replace(/\s+/g, " ").trim();
        if (href) links.push({ url: new URL(href, rootUrl).toString(), rangeText: text });
    });
    return links;
}

function parseMonthDay(s) {
    const m = s.match(/\b([A-Za-z]{3})\s+(\d{1,2})\b/);
    if (!m) return null;
    const monthIdx = MONTHS.findIndex(mon => mon.toLowerCase() === m[1].toLowerCase());
    if (monthIdx === -1) return null;
    return { monthIdx, day: parseInt(m[2], 10) };
}

function parseShowLi($, li) {
    const $li = $(li);
    const venue = $li.find("b > a").first().text().replace(/\s+/g, " ").trim();
    const artists = $li
        .find('a[href^="by-band."]')
        .map((_, a) => $(a).text().replace(/\s+/g, " ").trim())
        .get()
        .filter(Boolean);

    const contents = $li.contents().toArray();
    let lastAnchorIdx = -1;
    contents.forEach((node, idx) => {
        if (node.type === "tag" && node.name === "a") lastAnchorIdx = idx;
    });
    const details = contents
        .slice(lastAnchorIdx + 1)
        .map(node => (node.type === "text" ? $(node).text() : ""))
        .join("")
        .replace(/\s+/g, " ")
        .trim();

    return { venue, artists, details };
}

function extractShowsFromWeekHtml(weekHtml, { pageUrl, rangeText, startYear }) {
    const $ = cheerio.load(weekHtml);
    const h2Range = $("h2").first().text().replace(/\s+/g, " ").trim();
    const effectiveRangeText = h2Range || rangeText;

    const rangeStart = parseMonthDay(effectiveRangeText);
    const pageMonthIdx = rangeStart ? rangeStart.monthIdx : null;

    const shows = [];
    const dayLis = $("body").children("ul").first().children("li");

    dayLis.each((_, dayLi) => {
        const $dayLi = $(dayLi);
        const dayText = $dayLi.children("a[name]").first().find("b").text().replace(/\s+/g, " ").trim();
        const dayInfo = parseMonthDay(dayText);
        if (!dayText || !dayInfo) return;

        let year = startYear;
        if (pageMonthIdx !== null && dayInfo.monthIdx < pageMonthIdx) year += 1;

        const isoDate = `${year}-${String(dayInfo.monthIdx + 1).padStart(2, "0")}-${String(dayInfo.day).padStart(2, "0")}`;
        const dayOfWeek = dayText.split(/\s+/)[0] || null;

        const showLis = $dayLi.children("ul").first().children("li");
        showLis.each((_, showLi) => {
            const { venue, artists, details } = parseShowLi($, showLi);
            if (!venue && artists.length === 0) return;

            shows.push({
                date: isoDate,
                dayOfWeek,
                rawDay: dayText,
                venue,
                artists,
                details,
                dateRange: effectiveRangeText,
                sourceUrl: pageUrl,
            });
        });
    });

    return shows;
}

function groupShowsByArtist(allShows) {
    const byArtist = new Map();

    for (const { artists, ...showInfo } of allShows) {
        for (const artist of artists) {
            if (!byArtist.has(artist)) byArtist.set(artist, []);
            byArtist.get(artist).push(showInfo);
        }
    }

    return byArtist;
}

/**
 * Scrapes every weekly page linked from http://www.foopee.com/punk/the-list/
 * and upserts one Firestore doc per artist (doc ID = artist name) containing
 * that artist's upcoming shows (date, venue, price/time/age details).
 */
async function scrapeFoopeeListToFirestore(db, opts = {}) {
    const {
        rootUrl = ROOT_URL,
        timeoutMs = 30000,
        retries = 3,
        userAgent = "Mozilla/5.0 (compatible; FoopeeScraper/1.0)",
        collectionName = "foopeeArtists",
        delayMs = 500,
        startYear = new Date().getFullYear(),
        batchSize = 400,
    } = opts;

    const rootHtml = await fetchHtmlWithRetry(rootUrl, { timeoutMs, retries, userAgent });
    const dateRangeLinks = getDateRangeLinks(rootHtml, rootUrl);

    const allShows = [];
    let currentYear = startYear;
    let lastMonthIdx = null;

    for (const { url, rangeText } of dateRangeLinks) {
        const rangeStart = parseMonthDay(rangeText);
        if (rangeStart) {
            if (lastMonthIdx !== null && rangeStart.monthIdx < lastMonthIdx) currentYear += 1;
            lastMonthIdx = rangeStart.monthIdx;
        }

        const weekHtml = await fetchHtmlWithRetry(url, { timeoutMs, retries, userAgent });
        const shows = extractShowsFromWeekHtml(weekHtml, { pageUrl: url, rangeText, startYear: currentYear });
        allShows.push(...shows);

        if (delayMs) await sleep(delayMs);
    }

    const byArtist = groupShowsByArtist(allShows);
    const artistEntries = [...byArtist.entries()];

    const collectionRef = db.collection(collectionName);
    for (let i = 0; i < artistEntries.length; i += batchSize) {
        const batch = db.batch();
        const chunk = artistEntries.slice(i, i + batchSize);
        for (const [artistName, shows] of chunk) {
            const docId = sanitizeArtistDocId(artistName);
            batch.set(collectionRef.doc(docId), { name: artistName, shows, scrapedAt: new Date() }, { merge: true });
        }
        await batch.commit();
    }

    return { pagesScraped: dateRangeLinks.length, showsStored: allShows.length, artistsStored: artistEntries.length };
}

module.exports = { scrapeFoopeeListToFirestore };
