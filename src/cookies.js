function parseCookies(req) {
    const header = req.headers.cookie;
    const out = {};
    if (!header) return out;
    header.split(';').forEach((pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        if (!key) return;
        try {
            out[key] = decodeURIComponent(val);
        } catch (e) {
            out[key] = val;
        }
    });
    return out;
}

module.exports = { parseCookies };
